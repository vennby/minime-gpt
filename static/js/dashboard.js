/**
 * Dashboard interactions (external file so CSP script-src 'self' allows it).
 */
document.addEventListener("DOMContentLoaded", () => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";

  async function shareProject(projectId, { rotate = false } = {}) {
    try {
      const response = await fetch(`/api/projects/${projectId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ rotate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Share failed");

      if (data.share_url) {
        try {
          await navigator.clipboard.writeText(data.share_url);
          alert(`Share link copied.\n\n${data.share_url}`);
        } catch {
          prompt("Share link:", data.share_url);
        }
      }
    } catch (error) {
      alert(error.message || "Failed to generate share link");
    }
  }

  async function revokeShare(projectId) {
    if (!confirm("Revoke the share link for this project?")) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/share`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Revoke failed");
      alert("Share link revoked.");
    } catch (error) {
      alert(error.message || "Failed to revoke share link");
    }
  }

  document.querySelectorAll("[data-share-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      shareProject(btn.getAttribute("data-share-project"));
    });
  });

  document.querySelectorAll("[data-rotate-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      shareProject(btn.getAttribute("data-rotate-share"), { rotate: true });
    });
  });

  document.querySelectorAll("[data-revoke-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      revokeShare(btn.getAttribute("data-revoke-share"));
    });
  });

  const profileMenuBtn = document.getElementById("profileMenuBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileMenuBtn && profileDropdown) {
    profileMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".navbar-profile")) {
        profileDropdown.classList.add("hidden");
      }
    });
  }

  const searchInput = document.getElementById("projectSearch");
  searchInput?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll(".project-card").forEach((card) => {
      const title = card.getAttribute("data-title") || "";
      card.style.display = title.includes(query) ? "" : "none";
    });
  });

  document.querySelectorAll("form[data-confirm-delete]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      const message = form.getAttribute("data-confirm-delete") || "Are you sure?";
      if (!confirm(message)) e.preventDefault();
    });
  });
});
