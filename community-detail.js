
import {
  supabase,
  $,
  initShell,
  getProfiles,
  postCard,
  setNotice,
  displayName,
  avatarHTML
} from "./shared.js?v=21";

const shell = await initShell("communities");

if (shell) {

  const params = new URLSearchParams(window.location.search);
  const communityId = params.get("id");

  let community = null;
  let members = [];
  let isJoined = false;
  let canManageMembers = false;
  let isOwner = false;
  $("#communityPostForm").querySelectorAll("textarea,button").forEach(el => { el.disabled = true; });

  if (!communityId) {
    $("#communityStatus").textContent = "缺少社区编号，请返回社区列表重新进入。";
  } else {

    // 加载社区基本信息
    async function loadCommunity() {

      $("#communityStatus").textContent = "正在加载社区...";

      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .eq("id", communityId)
        .single();

      if (error) {
        $("#communityStatus").textContent =
          "读取社区失败：" + error.message;
        return;
      }

      community = data;

      $("#communityName").textContent = community.name;
      $("#communityDescription").textContent =
        community.description || "欢迎来到这个社区！";
      renderAnnouncement();
      renderAppearance();

      await Promise.allSettled([loadMembers(), loadPosts()]);
    }

    // 加载社区成员
    async function loadMembers() {

      const { data, error } = await supabase
        .from("community_members")
        .select("user_id,role,joined_at")
        .eq("community_id", communityId);

      if (error) {
        $("#communityMembers").textContent =
          "读取成员失败：" + error.message;
        return;
      }

      members = data || [];

      const mine = members.find(m => m.user_id === shell.user.id);
      isOwner = community?.owner_id === shell.user.id;
      canManageMembers = isOwner;
      isJoined = isOwner || !!mine;

      let profiles = {};
      try { profiles = await getProfiles(members.map(m => m.user_id)); }
      catch (err) { console.error("成员资料读取失败", err); }

      $("#communityMeta").innerHTML = `
        👥 ${members.length} 位成员
        <button
          id="membershipButton"
          class="btn small ${isJoined ? "secondary" : ""}"
          style="margin-left:12px"
          ${community?.owner_id === shell.user.id ? "disabled" : ""}
        >
          ${community?.owner_id === shell.user.id ? "社区创建者" : isJoined ? "退出社区" : "加入社区"}
        </button>
      `;

      $("#communityMembers").innerHTML =
        members.map(m => {
          const p = profiles[m.user_id];
          if (!p) return "";

          const roleButton = isOwner && m.user_id !== shell.user.id && m.user_id !== community?.owner_id ? `<button class="btn ghost small" data-member-role="${m.user_id}" data-role="${m.role === "admin" ? "member" : "admin"}">${m.role === "admin" ? "取消管理员" : "设为管理员"}</button>` : "";
          const removeButton = canManageMembers && m.user_id !== shell.user.id && m.user_id !== community?.owner_id ? `<button class="btn ghost small" data-member-remove="${m.user_id}">移除</button>` : "";
          return `
            <div class="suggestion">
              ${avatarHTML(p)}
              <div class="grow">
                <strong>${displayName(p)}</strong>
                <small>${m.role === "owner" ? "社区创建者" : m.role === "admin" ? "社区管理员" : "社区成员"}</small>
              </div>
              <div class="admin-actions">${roleButton}${removeButton}</div>
            </div>
          `;
        }).join("") || (members.length ? "成员资料暂时无法加载。" : "暂时没有成员");

      $("#membershipButton").addEventListener("click", toggleMembership);
      $("#communityPostForm").querySelectorAll("textarea,button").forEach(el => { el.disabled = !isJoined; });
      if (!isJoined) setNotice($("#communityPostNotice"), "加入社区后即可发布社区动态。", "");
      else setNotice($("#communityPostNotice"), "", "");
    }


    function cropImage(file, field) {
      return new Promise((resolve, reject) => {
        if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5242880) { reject(new Error("请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片")); return; }
        const url = URL.createObjectURL(file), img = new Image();
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取图片")); };
        img.onload = () => {
          const square = field === "avatar_url", w = square ? 512 : 1200, h = square ? 512 : 360;
          const dialog = document.createElement("dialog");
          dialog.style.cssText = "width:min(92vw,560px);max-height:90dvh;overflow:auto;box-sizing:border-box;border:1px solid #dce2ef;border-radius:20px;padding:20px;background:var(--panel,#fff);color:inherit";
          dialog.innerHTML = '<h2 style="margin:0 0 12px">调整图片</h2><p class="muted">拖动图片调整位置，滑动下方控件缩放。</p><canvas aria-label="图片裁剪预览" style="display:block;width:100%;touch-action:none;cursor:grab;background:#e8efff"></canvas><label style="display:flex;align-items:center;gap:12px;margin:16px 0">缩放<input aria-label="缩放图片" type="range" min="1" max="4" step="0.01" value="1" style="flex:1;min-width:0"></label><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn secondary small">取消</button><button type="button" class="btn small">确认上传</button></div>';
          const canvas=dialog.querySelector("canvas"), ctx=canvas.getContext("2d"), slider=dialog.querySelector("input"), [cancel,save]=dialog.querySelectorAll("button");
          canvas.width=w;canvas.height=h;canvas.style.borderRadius=square?"50%":"12px";
          let x=0,y=0,zoom=1,drag=null;
          const base=Math.max(w/img.naturalWidth,h/img.naturalHeight);
          function draw(){const iw=img.naturalWidth*base*zoom,ih=img.naturalHeight*base*zoom;x=Math.max(-(iw-w)/2,Math.min((iw-w)/2,x));y=Math.max(-(ih-h)/2,Math.min((ih-h)/2,y));ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,(w-iw)/2+x,(h-ih)/2+y,iw,ih);}
          slider.oninput=()=>{zoom=Number(slider.value);draw();};
          canvas.onpointerdown=e=>{if(drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
          canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const ratio=w/canvas.getBoundingClientRect().width;x+=(e.clientX-drag.x)*ratio;y+=(e.clientY-drag.y)*ratio;drag.x=e.clientX;drag.y=e.clientY;draw();};
          canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
          function finish(value){dialog.close();dialog.remove();URL.revokeObjectURL(url);resolve(value);}
          cancel.onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();if(!save.disabled)finish(null);};
          save.onclick=()=>{save.disabled=true;cancel.disabled=true;canvas.toBlob(blob=>{if(!blob){save.disabled=cancel.disabled=false;return;}finish(new File([blob],"community.jpg",{type:"image/jpeg"}));},"image/jpeg",0.92);};
          document.body.append(dialog);dialog.showModal();draw();
        };
        img.src=url;
      });
    }

    function editCommunityDetails() {
      if(community.owner_id!==shell.user.id)return;
      const host=document.createElement("form");
      host.style.cssText="display:grid;gap:10px;margin:12px 0";
      host.innerHTML='<label>社区名称<input class="field" name="name" maxlength="80" required style="display:block;width:100%;box-sizing:border-box"></label><label>社区简介<textarea class="field" name="description" maxlength="300" rows="3" style="display:block;width:100%;box-sizing:border-box"></textarea></label><div style="display:flex;gap:8px"><button class="btn small" type="submit">保存</button><button class="btn secondary small" type="button">取消</button></div><small role="status" class="muted"></small>';
      const name=host.elements.name,description=host.elements.description,[save,cancel]=host.querySelectorAll("button"),status=host.querySelector("small");
      name.value=community.name;description.value=community.description||"";
      const title=$("#communityName"),desc=$("#communityDescription");title.hidden=desc.hidden=true;desc.after(host);
      function close(){host.remove();title.hidden=desc.hidden=false;renderAppearance();}
      cancel.onclick=close;
      host.onsubmit=async e=>{e.preventDefault();if(!name.value.trim()){name.focus();return;}save.disabled=cancel.disabled=name.disabled=description.disabled=true;save.textContent="保存中…";try{const {data,error}=await supabase.from("communities").update({name:name.value.trim(),description:description.value.trim()}).eq("id",communityId).eq("owner_id",shell.user.id).select("name,description").single();if(error)throw error;Object.assign(community,data);title.textContent=data.name;desc.textContent=data.description||"欢迎来到这个社区！";close();}catch(error){console.warn("Community details save failed",error);status.textContent="保存失败，请重试";save.disabled=cancel.disabled=name.disabled=description.disabled=false;save.textContent="保存";}};
      name.focus();
    }

    function renderAppearance() {
      const host = document.querySelector("#communityAppearance");
      host.replaceChildren();
      const bucket = supabase.storage.from("community-images");
      const valid = url => typeof url === "string" && url.startsWith(bucket.getPublicUrl(communityId + "/").data.publicUrl);
      if (valid(community.cover_url)) {
        const cover = document.createElement("img");
        cover.src = community.cover_url; cover.alt = "社区背景";
        cover.style.cssText = "width:100%;height:190px;object-fit:cover;border-radius:16px;display:block;margin:12px 0";
        host.append(cover);
      }
      const avatar = document.createElement("div");
      avatar.style.cssText = "width:72px;height:72px;border-radius:50%;background:#e8efff;display:grid;place-items:center;font-size:28px;overflow:hidden;margin:16px 0 0";
      if (valid(community.avatar_url)) { const img=document.createElement("img");img.src=community.avatar_url;img.alt="社区头像";img.style.cssText="width:100%;height:100%;object-fit:cover";avatar.append(img); } else avatar.textContent="◉";
      host.append(avatar);
      if (community.owner_id !== shell.user.id) return;
      const controls=document.createElement("div");
      controls.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px";
      host.append(controls);
      function button(label, action) { const b=document.createElement("button");b.type="button";b.className="btn secondary small";b.textContent=label;b.onclick=action;controls.append(b);return b; }
      button("编辑社区资料",()=>{if(document.querySelector("#communityName").hidden)return;editCommunityDetails();});
      async function change(field,file) {
        const buttons=controls.querySelectorAll("button");buttons.forEach(b=>b.disabled=true); controls.querySelectorAll("input").forEach(i=>i.disabled=true); controls.setAttribute("aria-busy","true");
        let path=null, saved=false;
        try {
          if(file && (!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5242880)) throw new Error("Unsupported image or size");
          if(file) {
            path=communityId+"/"+field+"-"+crypto.randomUUID()+"."+({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type]);
            const upload=await bucket.upload(path,file,{contentType:file.type});if(upload.error)throw upload.error;
          }
          const url=path?bucket.getPublicUrl(path).data.publicUrl:null;
          const old=community[field];
          const {data,error}=await supabase.from("communities").update({[field]:url}).eq("id",communityId).eq("owner_id",shell.user.id).select(field).single();
          if(error)throw error;
          saved=true;community[field]=data[field];renderAppearance();
          if(valid(old)) { const prefix=bucket.getPublicUrl("").data.publicUrl; const oldPath=old.slice(prefix.length); if(oldPath.startsWith(communityId+"/"+field+"-")) await bucket.remove([oldPath]); }
        } catch(error) { console.warn("Community appearance save failed",error);hint.textContent="图片保存失败，请重试";if(path&&!saved)await bucket.remove([path]); }
        finally {buttons.forEach(b=>b.disabled=false);controls.querySelectorAll("input").forEach(i=>i.disabled=false);controls.removeAttribute("aria-busy");}
      }
      for(const [field,label] of [["avatar_url","头像"],["cover_url","背景"]]) {
        const input=document.createElement("input");input.type="file";input.accept="image/jpeg,image/png,image/webp";input.id="community-file-"+field; input.setAttribute("aria-label","上传"+label);
        input.onchange=async()=>{const file=input.files[0];input.value="";if(!file)return;try{const cropped=await cropImage(file,field);if(cropped)await change(field,cropped);}catch(error){console.warn(error);hint.textContent=error.message;}};
        const picker=document.createElement("label");
        picker.className="btn secondary small";
        picker.htmlFor=input.id;
        picker.style.cssText="position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer";
        picker.textContent=(community[field]?"更换":"上传")+label;
        input.style.cssText="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;display:block!important;z-index:2;margin:0;padding:0";
        picker.append(input);controls.append(picker);
        if(community[field])button("删除"+label,()=>change(field,null));
      }
      const hint=document.createElement("small");hint.className="muted";hint.textContent="支持 JPG、PNG、WebP，单张不超过 5 MB";host.append(hint);
    }

    function renderAnnouncement() {
      const host = $("#communityAnnouncement");
      if (!host) return;
      const p = document.createElement("p");
      p.textContent = community?.announcement || "暂无公告";
      host.replaceChildren();
      const heading = document.createElement("h2"); heading.textContent = "社区公告"; host.append(heading, p);
      if (community?.owner_id === shell.user.id) {
        const button = document.createElement("button"); button.className = "btn secondary small"; button.textContent = "编辑公告";
        p.style.whiteSpace = "pre-wrap";
        button.type = "button";
        button.addEventListener("click", () => {
          const editor = document.createElement("textarea");
          editor.className = "field";
          editor.rows = 5;
          editor.maxLength = 1000;
          editor.value = community.announcement || "";
          editor.placeholder = "输入社区公告…";
          editor.setAttribute("aria-label", "编辑社区公告");
          editor.style.cssText = "display:block;width:100%;box-sizing:border-box;resize:vertical;margin:12px 0";
          const actions = document.createElement("div");
          actions.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
          const save = document.createElement("button"), cancel = document.createElement("button");
          save.type = cancel.type = "button";
          save.className = "btn small"; save.textContent = "保存";
          cancel.className = "btn secondary small"; cancel.textContent = "取消";
          actions.append(save, cancel);
          host.replaceChildren(heading, editor, actions);
          cancel.onclick = renderAnnouncement;
          save.onclick = async () => {
            save.disabled = cancel.disabled = editor.disabled = true;
            save.textContent = '保存中…';
            try {
              const { data, error } = await supabase.from("communities").update({ announcement: editor.value.trim() }).eq("id", communityId).eq("owner_id", shell.user.id).select("announcement").single();
              if (error) throw error;
              community.announcement = data.announcement;
              renderAnnouncement();
            } catch (error) {
              console.warn("Announcement save failed", error);
              save.disabled = cancel.disabled = editor.disabled = false;
              save.textContent = '保存';
              editor.focus();
            }
          };
          editor.focus();
        }); host.append(button);
      }
    }

    // 加入或退出社区
    async function toggleMembership() {
      if (community?.owner_id === shell.user.id) return;

      const button = $("#membershipButton");
      button.disabled = true;

      let result;

      if (isJoined) {

        result = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", shell.user.id);

      } else {

        result = await supabase
          .from("community_members")
          .insert({
            community_id: communityId,
            user_id: shell.user.id,
            role: "member",
            joined_at: new Date().toISOString()
          });
      }

      if (result.error) {
        alert("操作失败：" + result.error.message);
      }

      await loadMembers();
    }

    // 加载当前社区动态
    async function loadPosts() {

      $("#communityStatus").textContent =
        "正在加载社区动态...";

      const { data: posts, error } = await supabase
        .from("posts")
        .select("*")
        .eq("community_id", communityId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        $("#communityStatus").textContent =
          "读取动态失败：" + error.message;
        return;
      }

      if (!posts || posts.length === 0) {
        $("#communityPosts").innerHTML =
          '<div class="empty">这个社区还没有动态，发布第一条吧！</div>';

        $("#communityStatus").textContent =
          "暂无社区动态";

        return;
      }

      const ids = posts.map(p => p.user_id);
      let profiles = {};
      try { profiles = await getProfiles(ids); }
      catch (err) { console.error("动态发布者资料读取失败", err); }

      const postIds = posts.map(p => p.id);

      const [likeResult, commentResult] = await Promise.all([
        supabase
          .from("likes")
          .select("post_id,user_id")
          .in("post_id", postIds),

        supabase
          .from("comments")
          .select("*")
          .in("post_id", postIds)
          .order("created_at", { ascending: true })
      ]);

      const likes = likeResult.error ? [] : (likeResult.data || []);
      const comments = commentResult.error ? [] : (commentResult.data || []);

      const commenterIds = comments
        .map(c => c.user_id)
        .filter(id => !profiles[id]);

      if (commenterIds.length) {
        try { profiles = { ...profiles, ...await getProfiles(commenterIds) }; }
        catch (err) { console.warn("评论者资料读取失败", err); }
      }

      $("#communityPosts").innerHTML = posts.map(p => {

        const liked = likes.some(
          l => l.post_id === p.id &&
               l.user_id === shell.user.id
        );

        const cs = comments
          .filter(c => c.post_id === p.id)
          .map(c => ({
            ...c,
            profile: profiles[c.user_id]
          }));

        return postCard(
          p,
          profiles[p.user_id],
          liked,
          cs,
          shell.user.id
        );

      }).join("");

      $("#communityStatus").textContent =
        `共 ${posts.length} 条社区动态`;
    }

    // 发布表单状态在 loadMembers() 中根据实际成员身份设置。
    $("#communityPostForm").addEventListener(
      "submit",
      async e => {

        e.preventDefault();

        const content = $("#communityPostText")
          .value.trim();

        if (!content) {
          setNotice(
            $("#communityPostNotice"),
            "请输入动态内容。",
            "error"
          );
          return;
        }

        const button = e.target.querySelector(
          'button[type="submit"]'
        );

        button.disabled = true;
        button.textContent = "正在发布...";

        try {
          const { error } = await supabase.from("posts").insert({
            user_id: shell.user.id,
            community_id: communityId,
            content,
            media_url: null,
            media_type: null,
            created_at: new Date().toISOString()
          });
          if (error) throw error;
          $("#communityPostText").value = "";
          await loadPosts();
          setNotice($("#communityPostNotice"), "社区动态发布成功！", "success");
        } catch (err) {
          console.error("社区动态发布失败", err);
          setNotice($("#communityPostNotice"), "发布失败：" + (err.message || err), "error");
        } finally {
          button.disabled = false;
          button.textContent = "发布动态";
        }
      }
    );

async function handlePostManagement(button, card) {
  const action = button.dataset.action;
  button.disabled = true;
  try {
    if (action === "edit-post") {
      const contentEl = card.querySelector(".post-content");
      const current = contentEl?.textContent || "";
      const next = prompt("编辑动态内容：", current);
      if (next === null) return;
      const content = next.trim();
      if (!content) throw new Error("动态内容不能为空；如需移除内容，请删除这条动态。");
      const { error } = await supabase.from("posts").update({ content }).eq("id", card.dataset.post).eq("user_id", shell.user.id);
      if (error) throw error;
      if (contentEl) contentEl.textContent = content;
      else {
        const el = document.createElement("div");
        el.className = "post-content";
        el.textContent = content;
        card.querySelector(".post-head").after(el);
      }
    } else if (action === "delete-post") {
      if (!confirm("确定删除这条动态吗？此操作无法撤销。")) return;
      const { error } = await supabase.from("posts").delete().eq("id", card.dataset.post).eq("user_id", shell.user.id);
      if (error) throw error;
      card.remove();
    } else if (action === "delete-comment") {
      const comment = button.closest("[data-comment]");
      if (!comment || !confirm("确定删除这条评论吗？")) return;
      const { error } = await supabase.from("comments").delete().eq("id", comment.dataset.comment).eq("user_id", shell.user.id);
      if (error) throw error;
      comment.remove();
      const count = card.querySelector('[data-action="toggle-comments"] span');
      if (count) {
        const value = Math.max(0, Number(count.textContent || 0) - 1);
        count.textContent = value || "";
      }
    }
  } catch (error) {
    alert("操作失败：" + (error?.message || error));
  } finally {
    button.disabled = false;
  }
}

    // 点赞和评论展开
    $("#communityPosts").addEventListener(
      "click",
      async e => {

        const button = e.target.closest("button[data-action]");

        if (!button) return;

        const card = button.closest("[data-post]");
        if (!card) return;

        const postId = card.dataset.post;

        if (["edit-post","delete-post","delete-comment"].includes(button.dataset.action)) {
          await handlePostManagement(button, card);
          return;
        }

        if (button.dataset.action === "toggle-comments") {
          const box = card.querySelector(".comment-list");
          if (box) box.hidden = !box.hidden;
          return;
        }

        if (button.dataset.action === "like") {

          button.disabled = true;

          try {

            const { data: existing, error } = await supabase
              .from("likes")
              .select("id")
              .eq("post_id", postId)
              .eq("user_id", shell.user.id)
              .maybeSingle();

            if (error) throw error;

            if (existing) {

              const { error: deleteError } = await supabase
                .from("likes")
                .delete()
                .eq("id", existing.id);

              if (deleteError) throw deleteError;

            } else {

              const { error: insertError } = await supabase
                .from("likes")
                .insert({
                  post_id: postId,
                  user_id: shell.user.id,
                  created_at: new Date().toISOString()
                });

              if (insertError) throw insertError;
            }

            await loadPosts();

          } catch (err) {
            alert("点赞失败：" + err.message);
          }

          button.disabled = false;
        }
      }
    );

    // 提交评论
    $("#communityPosts").addEventListener(
      "submit",
      async e => {

        if (!e.target.matches(".comment-form")) return;

        e.preventDefault();

        const form = e.target;
        const card = form.closest("[data-post]");
        const postId = card.dataset.post;

        const input = form.elements.content;
        const content = input.value.trim();

        if (!content) return;

        const button = form.querySelector("button");
        button.disabled = true;

        const { error } = await supabase
          .from("comments")
          .insert({
            post_id: postId,
            user_id: shell.user.id,
            content,
            created_at: new Date().toISOString()
          });

        if (error) {
          alert("评论失败：" + error.message);
        } else {
          await loadPosts();
        }

        button.disabled = false;
      }
    );

    $("#communityMembers").addEventListener("click", async event => {
      const roleButton = event.target.closest("[data-member-role]");
      const removeButton = event.target.closest("[data-member-remove]");
      if (!roleButton && !removeButton) return;
      const target = roleButton ? roleButton.dataset.memberRole : removeButton.dataset.memberRemove;
      if (!canManageMembers || target === community.owner_id || target === shell.user.id) return;
      const button = roleButton || removeButton;
      if (removeButton && !confirm("确定将该成员移出社区吗？")) return;
      button.disabled = true;
      const result = roleButton
        ? await supabase.from("community_members").update({ role: roleButton.dataset.role }).eq("community_id", communityId).eq("user_id", target)
        : await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", target);
      if (result.error) { alert("管理操作失败：" + result.error.message); button.disabled = false; return; }
      await loadMembers();
    });
    // 初始化页面
    await loadCommunity();
  }
}



