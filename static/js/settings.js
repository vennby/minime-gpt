/**
 * Settings page interactions (CSP-safe external script).
 * Theme toggling is handled globally by theme.js via [data-theme-toggle].
 */
document.addEventListener("DOMContentLoaded", () => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  window.MinimeTheme?.bindToggles?.();

  const profileForm = document.getElementById("profileForm");
  profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("nameInput");
    if (!nameInput?.value.trim()) {
      alert("Please enter a name");
      return;
    }
    fetch(profileForm.dataset.updateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ name: nameInput.value.trim() }),
    })
      .then((response) => {
        if (response.ok) {
          alert("Profile updated successfully!");
          location.reload();
        } else {
          alert("Failed to update profile");
        }
      })
      .catch(() => alert("Error updating profile"));
  });

  const deleteModal = document.getElementById("deleteModal");
  document.getElementById("deleteAccountBtn")?.addEventListener("click", () => {
    deleteModal?.classList.remove("hidden");
  });
  document.getElementById("cancelBtn")?.addEventListener("click", () => {
    deleteModal?.classList.add("hidden");
  });
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) deleteModal.classList.add("hidden");
  });
});
