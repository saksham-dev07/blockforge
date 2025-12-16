// Welcome page script
document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('startBrowsing').addEventListener('click', () => {
  window.close();
});
