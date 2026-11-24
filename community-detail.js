
import {
  supabase,
  $,
  initShell,
  getProfiles,
  postCard,
  setNotice,
  displayName,
  avatarHTML
} from "./shared.js?v=5";

const shell = await initShell("communities");

if (shell) {

  const params = new URLSearchParams(window.location.search);
  const communityId = params.get("id");

  let community = null;
  let members = [];
  let isJoined = false;

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

      isJoined = members.some(
        m => m.user_id === shell.user.id
      );

      let profiles = {};
      try { profiles = await getProfiles(members.map(m => m.user_id)); }
      catch (err) { console.error("成员资料读取失败", err); }

      $("#communityMeta").innerHTML = `
        👥 ${members.length} 位成员
        <button
          id="membershipButton"
          class="btn small ${isJoined ? "secondary" : ""}"
          style="margin-left:12px"
        >
          ${isJoined ? "退出社区" : "加入社区"}
        </button>
      `;

      $("#communityMembers").innerHTML =
        members.map(m => {
          const p = profiles[m.user_id];
          if (!p) return "";

          return `
            <div class="suggestion">
              ${avatarHTML(p)}
              <div class="grow">
                <strong>${displayName(p)}</strong>
                <small>${m.role === "owner" ? "社区创建者" : "社区成员"}</small>
              </div>
            </div>
          `;
        }).join("") || (members.length ? "成员资料暂时无法加载。" : "暂时没有成员");

      $("#membershipButton").addEventListener(
        "click",
        toggleMembership
      );
    }

    // 加入或退出社区
    async function toggleMembership() {

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

    // 发布社区动态
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

    // 初始化页面
    await loadCommunity();
  }
}



