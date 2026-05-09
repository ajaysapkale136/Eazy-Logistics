// profile-edit helpers (preview & remove)
document.addEventListener('DOMContentLoaded', function () {
  const input = document.getElementById('profileImage');
  const smallPreview = document.getElementById('smallPreview');
  const previewImage = document.getElementById('previewImage');
  const removeBtn = document.getElementById('removeImage');

  if (!input) return;

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (smallPreview) smallPreview.src = url;
    if (previewImage) previewImage.src = url;
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      input.value = "";
      if (smallPreview) smallPreview.src = "/images/default-avatar.png";
      if (previewImage) previewImage.src = "/images/default-avatar.png";

      if (!document.getElementById('removeFlag')) {
        const flag = document.createElement('input');
        flag.type = 'hidden';
        flag.name = 'removeImage';
        flag.id = 'removeFlag';
        flag.value = '1';
        document.querySelector('form').appendChild(flag);
      }
    });
  }
});
