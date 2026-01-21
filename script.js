// Configuration
const CONFIG = {
  // n8nのWebhook URLを設定してください（仕訳直接登録版）
  WEBHOOK_URL: "https://my-n8n.xvps.jp/webhook/freee-deals",
  // API Keyを設定してください（本番環境では環境変数から取得推奨）
  API_KEY: "sk-freee-accounting-abc123",
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES: 50, // 最大ファイル数
};

// DOM Elements
const uploadForm = document.getElementById("upload-form");
const companyIdInput = document.getElementById("company-id");
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const previewContainer = document.getElementById("preview-container");
const submitBtn = document.getElementById("submit-btn");
const btnText = submitBtn.querySelector(".btn-text");
const btnLoading = submitBtn.querySelector(".btn-loading");
const resultCard = document.getElementById("result-card");
const errorCard = document.getElementById("error-card");

// State
let selectedFiles = [];

// Initialize
function init() {
  setupEventListeners();
  loadSavedCompanyId();
  // Enable multiple file selection
  fileInput.setAttribute("multiple", "true");
}

function setupEventListeners() {
  // Upload area click
  uploadArea.addEventListener("click", () => fileInput.click());

  // File input change
  fileInput.addEventListener("change", handleFileSelect);

  // Drag and drop
  uploadArea.addEventListener("dragover", handleDragOver);
  uploadArea.addEventListener("dragleave", handleDragLeave);
  uploadArea.addEventListener("drop", handleDrop);

  // Form submit
  uploadForm.addEventListener("submit", handleSubmit);

  // Company ID save
  companyIdInput.addEventListener("change", saveCompanyId);

  // New upload button
  document
    .getElementById("new-upload-btn")
    ?.addEventListener("click", resetForm);
  document.getElementById("retry-btn")?.addEventListener("click", resetForm);
}

// File handling
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length > 0) validateAndSetFiles(files);
}

function handleDragOver(e) {
  e.preventDefault();
  uploadArea.classList.add("dragover");
}

function handleDragLeave(e) {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
}

function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove("dragover");

  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) validateAndSetFiles(files);
}

function validateAndSetFiles(files) {
  const validFiles = [];

  for (const file of files) {
    // Check file type
    if (!file.type.startsWith("image/")) {
      continue;
    }

    // Check file size
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      continue;
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) {
    showError("有効な画像ファイルがありません");
    return;
  }

  if (validFiles.length > CONFIG.MAX_FILES) {
    showError(`最大${CONFIG.MAX_FILES}ファイルまでです`);
    return;
  }

  selectedFiles = validFiles;
  showPreviews(validFiles);
  updateSubmitButton();
}

function showPreviews(files) {
  previewContainer.innerHTML = "";

  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewItem = document.createElement("div");
      previewItem.className = "preview-item";
      previewItem.innerHTML = `
        <img src="${e.target.result}" alt="プレビュー ${index + 1}">
        <button type="button" class="remove-btn" data-index="${index}">×</button>
        <span class="preview-name">${file.name}</span>
      `;
      previewContainer.appendChild(previewItem);

      // Add remove event listener
      previewItem.querySelector(".remove-btn").addEventListener("click", () => {
        removeFile(index);
      });
    };
    reader.readAsDataURL(file);
  });

  uploadArea.classList.add("hidden");
  previewContainer.classList.remove("hidden");
}

function removeFile(index) {
  selectedFiles.splice(index, 1);

  if (selectedFiles.length === 0) {
    resetForm();
  } else {
    showPreviews(selectedFiles);
  }
  updateSubmitButton();
}

// Form handling
function updateSubmitButton() {
  const hasFiles = selectedFiles.length > 0;
  const hasCompanyId = companyIdInput.value.trim() !== "";
  submitBtn.disabled = !(hasFiles && hasCompanyId);

  // Update button text with file count
  if (hasFiles) {
    btnText.textContent = `${selectedFiles.length}件の仕訳を作成`;
  } else {
    btnText.textContent = "仕訳を作成";
  }
}

async function handleSubmit(e) {
  e.preventDefault();

  if (selectedFiles.length === 0 || !companyIdInput.value.trim()) return;

  setLoading(true);
  hideCards();

  const results = [];
  const errors = [];

  try {
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      updateLoadingText(`処理中... (${i + 1}/${selectedFiles.length})`);

      try {
        const base64Image = await fileToBase64(file);
        const response = await sendToWebhook({
          company_id: parseInt(companyIdInput.value.trim(), 10),
          image: base64Image,
          file_name: file.name,
        });

        if (response.success) {
          results.push({
            file_name: file.name,
            ...response,
          });
        } else {
          errors.push({
            file_name: file.name,
            error: response.error || "処理に失敗",
          });
        }
      } catch (error) {
        errors.push({
          file_name: file.name,
          error: error.message,
        });
      }
    }

    showResults(results, errors);
  } catch (error) {
    console.error("Error:", error);
    showError(error.message || "エラーが発生しました");
  } finally {
    setLoading(false);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function sendToWebhook(data) {
  const response = await fetch(CONFIG.WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": CONFIG.API_KEY,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  return response.json();
}

// UI Updates
function setLoading(loading) {
  if (loading) {
    submitBtn.disabled = true;
    btnText.classList.add("hidden");
    btnLoading.classList.remove("hidden");
  } else {
    updateSubmitButton();
    btnText.classList.remove("hidden");
    btnLoading.classList.add("hidden");
  }
}

function updateLoadingText(text) {
  const loadingText = btnLoading.querySelector("span") || btnLoading;
  if (loadingText.childNodes.length > 1) {
    loadingText.childNodes[loadingText.childNodes.length - 1].textContent =
      text;
  }
}

function hideCards() {
  resultCard.classList.add("hidden");
  errorCard.classList.add("hidden");
}

function showResults(results, errors) {
  const resultContent = document.querySelector(".result-content");
  resultContent.innerHTML = "";

  // Show success results
  if (results.length > 0) {
    const successHeader = document.createElement("h3");
    successHeader.textContent = `✅ 成功: ${results.length}件`;
    successHeader.style.color = "#10B981";
    successHeader.style.marginBottom = "12px";
    resultContent.appendChild(successHeader);

    results.forEach((result) => {
      const item = document.createElement("div");
      item.className = "result-item";
      item.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: 500; margin-bottom: 4px;">${result.description || result.file_name}</div>
          <div style="font-size: 12px; color: #64748B;">¥${(result.amount || 0).toLocaleString()}</div>
        </div>
      `;
      resultContent.appendChild(item);
    });
  }

  // Show errors
  if (errors.length > 0) {
    const errorHeader = document.createElement("h3");
    errorHeader.textContent = `❌ エラー: ${errors.length}件`;
    errorHeader.style.color = "#EF4444";
    errorHeader.style.marginTop = "16px";
    errorHeader.style.marginBottom = "12px";
    resultContent.appendChild(errorHeader);

    errors.forEach((error) => {
      const item = document.createElement("div");
      item.className = "result-item";
      item.style.borderLeft = "3px solid #EF4444";
      item.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: 500; margin-bottom: 4px;">${error.file_name}</div>
          <div style="font-size: 12px; color: #EF4444;">${error.error}</div>
        </div>
      `;
      resultContent.appendChild(item);
    });
  }

  document.querySelector("#result-card h2").textContent =
    `処理完了 (${results.length}/${results.length + errors.length}件成功)`;

  resultCard.classList.remove("hidden");
}

function showError(message) {
  document.getElementById("error-message").textContent = message;
  errorCard.classList.remove("hidden");
}

function resetForm() {
  selectedFiles = [];
  fileInput.value = "";
  previewContainer.innerHTML = "";
  previewContainer.classList.add("hidden");
  uploadArea.classList.remove("hidden");
  hideCards();
  updateSubmitButton();
  uploadForm.scrollIntoView({ behavior: "smooth" });
}

// Local Storage
function saveCompanyId() {
  localStorage.setItem("freee_company_id", companyIdInput.value);
}

function loadSavedCompanyId() {
  const saved = localStorage.getItem("freee_company_id");
  if (saved) {
    companyIdInput.value = saved;
    updateSubmitButton();
  }
}

// Company ID input listener
companyIdInput.addEventListener("input", updateSubmitButton);

// Initialize app
init();
