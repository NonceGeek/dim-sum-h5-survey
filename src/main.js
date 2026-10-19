import "./style.css";
import { supabase } from "./supabase.js";

const PHOTO_BUCKET = "liwan-photo";
const EVENT_ID = "liwan_building";
const BASIC_INFO_KEY = "liwan_building_basic_info";
const PHOTO_CONTENT_OPTIONS = [
  "正立面",
  "侧立面",
  "入口",
  "门窗",
  "阳台",
  "柱头",
  "彩绘",
  "灰塑",
  "石雕",
  "砖雕",
  "木雕",
  "其他",
];
const PHOTO_EMPTY_REQUIRED =
  '<span class="plus">＋</span><span class="ptile-label">点击上传<br />必传</span>';
const PHOTO_EMPTY_OPTIONAL =
  '<span class="plus">＋</span><span class="ptile-label">点击上传<br />选填</span>';

const form = document.getElementById("surveyForm");
const submitBtn = document.getElementById("submitBtn");
const successOverlay = document.getElementById("successOverlay");
const collectDateInput = document.getElementById("collectDate");
const streetCodeInput = document.getElementById("streetCode");
const buildingNameInput = document.getElementById("buildingName");
const regionOtherRadio = document.getElementById("regionOtherRadio");
const regionOtherInput = document.getElementById("regionOtherInput");
const regionOutsideRadio = document.getElementById("regionOutsideRadio");
const regionOutsideInput = document.getElementById("regionOutsideInput");
const regionOverseasRadio = document.getElementById("regionOverseasRadio");
const regionOverseasInput = document.getElementById("regionOverseasInput");
const photoList = document.getElementById("photoList");
const photoBlockTemplate = document.getElementById("photoBlockTemplate");
const addPhotoBtn = document.getElementById("addPhotoBtn");

let photoSeq = 0;

const REGION_EXTRA_FIELDS = [
  { value: "省外", radio: regionOutsideRadio, input: regionOutsideInput },
  { value: "海外", radio: regionOverseasRadio, input: regionOverseasInput },
  { value: "其他", radio: regionOtherRadio, input: regionOtherInput },
];

function syncRegionExtraInputs() {
  REGION_EXTRA_FIELDS.forEach(({ radio, input }) => {
    if (!radio.checked) input.value = "";
  });
}

function formatRegionValue(base, detail) {
  const text = (detail || "").trim();
  return text ? `${base}（${text}）` : base;
}

function parseRegionValue(region) {
  const match = String(region || "").match(/^(省外|海外|其他)(?:（(.+)）)?$/);
  if (!match) return { base: region, detail: "" };
  return { base: match[1], detail: match[2] || "" };
}

form.querySelectorAll('input[name="region"]').forEach((el) => {
  el.addEventListener("change", syncRegionExtraInputs);
});

REGION_EXTRA_FIELDS.forEach(({ radio, input }) => {
  input.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });
  input.addEventListener("focus", () => {
    radio.checked = true;
    syncRegionExtraInputs();
  });
  input.addEventListener("input", () => {
    radio.checked = true;
  });
});

function getBasicInfoFromForm() {
  const formData = new FormData(form);
  let region = formData.get("region") || "";
  let regionDetail = "";
  if (region === "省外") {
    regionDetail = (formData.get("regionOutside") || "").trim();
    region = formatRegionValue("省外", regionDetail);
  } else if (region === "海外") {
    regionDetail = (formData.get("regionOverseas") || "").trim();
    region = formatRegionValue("海外", regionDetail);
  } else if (region === "其他") {
    regionDetail = (formData.get("regionOther") || "").trim();
    region = formatRegionValue("其他", regionDetail);
  }
  return {
    gender: formData.get("gender") || "",
    ageRange: formData.get("ageRange") || "",
    region,
    regionDetail,
    phone: (formData.get("phone") || "").trim(),
    email: (formData.get("email") || "").trim(),
  };
}

function saveBasicInfo() {
  try {
    const info = getBasicInfoFromForm();
    const hasAny =
      info.gender || info.ageRange || info.region || info.phone || info.email;
    if (!hasAny) return;
    localStorage.setItem(BASIC_INFO_KEY, JSON.stringify(info));
  } catch {
    // ignore quota / private mode errors
  }
}

function applyBasicInfo(info) {
  if (!info) return;

  if (info.gender) {
    const el = form.querySelector(`input[name="gender"][value="${CSS.escape(info.gender)}"]`);
    if (el) el.checked = true;
  }

  if (info.ageRange) {
    const el = form.querySelector(
      `input[name="ageRange"][value="${CSS.escape(info.ageRange)}"]`
    );
    if (el) el.checked = true;
  }

  if (info.region) {
    const { base, detail } = parseRegionValue(info.region);
    const extra = REGION_EXTRA_FIELDS.find((item) => item.value === base);
    if (extra) {
      extra.radio.checked = true;
      syncRegionExtraInputs();
      extra.input.value = detail || info.regionDetail || "";
    } else {
      const el = form.querySelector(
        `input[name="region"][value="${CSS.escape(info.region)}"]`
      );
      if (el) el.checked = true;
      syncRegionExtraInputs();
    }
  }

  if (info.phone) {
    const phoneInput = form.querySelector('input[name="phone"]');
    if (phoneInput) phoneInput.value = info.phone;
  }

  if (info.email) {
    const emailInput = form.querySelector('input[name="email"]');
    if (emailInput) emailInput.value = info.email;
  }
}

function loadBasicInfo() {
  try {
    const raw = localStorage.getItem(BASIC_INFO_KEY);
    if (!raw) return;
    applyBasicInfo(JSON.parse(raw));
  } catch {
    // ignore parse / storage errors
  }
}

function bindBasicInfoAutosave() {
  const fields = form.querySelectorAll(
    'input[name="gender"], input[name="ageRange"], input[name="region"], input[name="regionOther"], input[name="regionOutside"], input[name="regionOverseas"], input[name="phone"], input[name="email"]'
  );
  fields.forEach((el) => {
    el.addEventListener("change", saveBasicInfo);
    el.addEventListener("input", saveBasicInfo);
  });
}

function todayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toYYMMDD(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  return isoDate.slice(2, 4) + isoDate.slice(5, 7) + isoDate.slice(8, 10);
}

function getPhotoBlocks() {
  return Array.from(photoList.querySelectorAll(".photo-block"));
}

function getPhotoContent(block) {
  return Array.from(
    block.querySelectorAll(".photo-content-group input:checked")
  ).map((el) => el.value);
}

function buildPhotoTitle(block) {
  const parts = [];
  const yymmdd = toYYMMDD(collectDateInput.value.trim());
  if (yymmdd) parts.push(yymmdd);

  const streetCode = streetCodeInput.value.trim();
  if (streetCode) parts.push(streetCode);

  const buildingName = buildingNameInput.value.trim();
  if (buildingName) parts.push(buildingName);

  const photoContent = getPhotoContent(block);
  if (photoContent.length > 0) parts.push(photoContent.join("/"));

  return parts.join("-") || "—";
}

function updatePhotoTitle(block) {
  const el = block.querySelector(".photo-title-text");
  if (el) el.textContent = buildPhotoTitle(block);
}

function updateAllPhotoTitles() {
  getPhotoBlocks().forEach(updatePhotoTitle);
}

function syncPhotoBlockLabels() {
  getPhotoBlocks().forEach((block, index) => {
    const n = index + 1;
    const required = index === 0;
    const label = block.querySelector(".photo-block-label");
    const storyLabel = block.querySelector(".photo-story-label");
    const tile = block.querySelector(".photo-tile");
    const removeBtn = block.querySelector(".photo-remove-btn");
    const storyError = block.querySelector(".photo-story-error");

    if (label) {
      label.classList.toggle("required", required);
      label.innerHTML = required
        ? `照片 ${n}`
        : `照片 ${n} <span class="opt-tag">选填</span>`;
    }

    if (storyLabel) {
      storyLabel.classList.toggle("required", required);
      storyLabel.innerHTML = required
        ? "故事线索"
        : '故事线索 <span class="opt-tag">上传照片后必填</span>';
    }

    if (tile) {
      tile.classList.toggle("must", required);
      if (!tile.classList.contains("filled")) {
        tile.querySelector(".ptile-inner").innerHTML = required
          ? PHOTO_EMPTY_REQUIRED
          : PHOTO_EMPTY_OPTIONAL;
      }
    }

    if (removeBtn) removeBtn.hidden = required;
    if (storyError) storyError.dataset.field = `story${n}`;
  });
}

function clearPhotoPreview(tile) {
  if (tile?.dataset.previewUrl) {
    URL.revokeObjectURL(tile.dataset.previewUrl);
    delete tile.dataset.previewUrl;
  }
}

function bindPhotoBlock(block) {
  const fileInput = block.querySelector(".photo-input");
  const tile = block.querySelector(".photo-tile");
  const storyInput = block.querySelector(".photo-story-input");
  const countEl = block.querySelector(".photo-story-count");
  const removeBtn = block.querySelector(".photo-remove-btn");

  block.querySelectorAll(".photo-content-group input").forEach((el) => {
    el.addEventListener("change", () => updatePhotoTitle(block));
  });

  const syncCount = () => {
    if (countEl) countEl.textContent = String(storyInput.value.length);
  };
  syncCount();
  storyInput.addEventListener("input", syncCount);

  fileInput.addEventListener("change", () => {
    clearPhotoPreview(tile);
    const inner = tile.querySelector(".ptile-inner");
    const isFirst = getPhotoBlocks()[0] === block;

    if (fileInput.files && fileInput.files[0]) {
      const url = URL.createObjectURL(fileInput.files[0]);
      tile.dataset.previewUrl = url;
      tile.classList.add("filled");
      inner.innerHTML = `<img class="ptile-thumb" src="${url}" alt="预览" />`;
    } else {
      tile.classList.remove("filled");
      inner.innerHTML = isFirst ? PHOTO_EMPTY_REQUIRED : PHOTO_EMPTY_OPTIONAL;
    }
  });

  removeBtn.addEventListener("click", () => {
    if (getPhotoBlocks().length <= 1) return;
    clearPhotoPreview(tile);
    block.remove();
    syncPhotoBlockLabels();
    updateAllPhotoTitles();
  });
}

function addPhotoBlock() {
  const fragment = photoBlockTemplate.content.cloneNode(true);
  const block = fragment.querySelector(".photo-block");
  photoSeq += 1;
  const id = photoSeq;
  block.dataset.photoIndex = String(id);

  const contentGroup = block.querySelector(".photo-content-group");
  const contentName = `photoContent${id}`;
  PHOTO_CONTENT_OPTIONS.forEach((value) => {
    const label = document.createElement("label");
    label.className = "radio-item";
    label.innerHTML = `<input type="checkbox" name="${contentName}" value="${value}" /><span>${value}</span>`;
    contentGroup.appendChild(label);
  });

  const fileInput = block.querySelector(".photo-input");
  fileInput.name = `photo${id}`;

  const storyInput = block.querySelector(".photo-story-input");
  storyInput.name = `story${id}`;
  storyInput.id = `story${id}`;

  photoList.appendChild(block);
  bindPhotoBlock(block);
  syncPhotoBlockLabels();
  updatePhotoTitle(block);
  return block;
}

function resetPhotoBlocks() {
  getPhotoBlocks().forEach((block) => {
    clearPhotoPreview(block.querySelector(".photo-tile"));
  });
  photoList.innerHTML = "";
  photoSeq = 0;
  addPhotoBlock();
}

function collectPhotoEntries() {
  return getPhotoBlocks().map((block, index) => {
    const n = index + 1;
    const fileInput = block.querySelector(".photo-input");
    const storyInput = block.querySelector(".photo-story-input");
    const role = `photo${n}`;
    return {
      index: n,
      role,
      block,
      file: fileInput.files?.[0] || null,
      contents: getPhotoContent(block),
      title: buildPhotoTitle(block),
      story: (storyInput.value || "").trim(),
    };
  });
}

function getFormData() {
  const formData = new FormData(form);
  const photoEntries = collectPhotoEntries();
  let region = formData.get("region") || "";
  if (region === "省外") {
    region = formatRegionValue("省外", formData.get("regionOutside"));
  } else if (region === "海外") {
    region = formatRegionValue("海外", formData.get("regionOverseas"));
  } else if (region === "其他") {
    region = formatRegionValue("其他", formData.get("regionOther"));
  }

  const photoContents = {};
  const photoTitles = {};
  const stories = {};
  const photos = {};
  photoEntries.forEach((entry) => {
    photoContents[entry.role] = entry.contents;
    photoTitles[entry.role] = entry.title;
    stories[entry.role] = entry.story;
    photos[entry.role] = entry.file;
  });

  return {
    gender: formData.get("gender") || "",
    ageRange: formData.get("ageRange") || "",
    region,
    phone: (formData.get("phone") || "").trim(),
    email: (formData.get("email") || "").trim(),
    collectDate: (formData.get("collectDate") || "").trim(),
    streetCode: (formData.get("streetCode") || "").trim(),
    buildingName: (formData.get("buildingName") || "").trim(),
    photoEntries,
    photoContents,
    photoTitles,
    stories,
    agree: formData.get("agree") === "on",
    photos,
  };
}

function isValidCollectDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isValidPhone(phone) {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (/^(\+?86)?1[3-9]\d{9}$/.test(cleaned)) return true;
  if (/^0\d{2,3}\d{7,8}$/.test(cleaned)) return true;
  return false;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validate(data) {
  const errors = {};
  if (!data.gender) errors.gender = "请选择您的性别";
  if (!data.ageRange) errors.ageRange = "请选择您的年龄段";
  if (!data.region) errors.region = "请选择您熟悉的语言文化地区";
  else if (data.region === "其他") errors.region = "请填写具体地区";
  if (!data.phone) errors.phone = "请输入您的联系电话";
  else if (!isValidPhone(data.phone))
    errors.phone = "请输入有效的手机号或固话（如 13800138000）";
  if (data.email && !isValidEmail(data.email))
    errors.email = "请输入有效的 Email 地址";
  if (!data.collectDate) errors.collectDate = "请选择采集日期";
  else if (!isValidCollectDate(data.collectDate))
    errors.collectDate = "请选择有效的采集日期";

  const first = data.photoEntries[0];
  if (!first?.file) errors.photos = "请上传照片 1";

  data.photoEntries.forEach((entry) => {
    if (entry.file && !entry.story) {
      errors[`story${entry.index}`] = `请填写照片 ${entry.index} 的故事线索`;
    }
  });

  if (!data.agree) errors.agree = "请勾选原创与授权确认";
  return errors;
}

function showErrors(errors) {
  document.querySelectorAll(".error-msg").forEach((el) => {
    el.textContent = "";
  });
  for (const [field, msg] of Object.entries(errors)) {
    const el = document.querySelector(`.error-msg[data-field="${field}"]`);
    if (el) el.textContent = msg;
  }
}

function fileExtension(name, fallback = ".jpg") {
  const match = String(name).match(/(\.[a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

async function uploadPhoto(file, role, collectDate, autoTitle, story) {
  const yymmdd = toYYMMDD(collectDate) || "unknown";
  const stamp = Date.now();
  const ext = fileExtension(file.name);
  // Supabase Storage keys must be ASCII-safe; keep Chinese titles in metadata only
  const path = `${EVENT_ID}/${yymmdd}/${stamp}-${role}${ext}`;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return {
    role,
    name: file.name,
    size: file.size,
    type: file.type,
    path,
    url: data.publicUrl,
    autoTitle,
    story: story || null,
  };
}

async function uploadAllPhotos(photoEntries, collectDate) {
  const jobs = [];
  for (const entry of photoEntries) {
    if (!entry.file) continue;
    jobs.push(
      uploadPhoto(entry.file, entry.role, collectDate, entry.title, entry.story)
    );
  }
  return Promise.all(jobs);
}

async function handleSubmit(e) {
  e.preventDefault();

  const data = getFormData();
  const errors = validate(data);
  showErrors(errors);
  if (Object.keys(errors).length > 0) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "上传图片中...";

  let uploadedPhotos;
  try {
    uploadedPhotos = await uploadAllPhotos(data.photoEntries, data.collectDate);
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = "提交问卷";
    alert("图片上传失败，请稍后重试：" + (err.message || err));
    return;
  }

  submitBtn.textContent = "提交中...";

  const content = {
    campaign: "荔湾历史建筑文化信息征集",
    gender: data.gender,
    ageRange: data.ageRange,
    region: data.region,
    phone: data.phone,
    email: data.email || null,
    collectDate: data.collectDate,
    collectDateYYMMDD: toYYMMDD(data.collectDate),
    streetCode: data.streetCode || null,
    buildingName: data.buildingName || null,
    photoContents: data.photoContents,
    photoTitles: data.photoTitles,
    stories: data.stories,
    photoFiles: uploadedPhotos,
    mediaType: "图片",
  };

  const { error } = await supabase.from("app_lib_h5_survey").insert({
    phone: data.phone,
    event_id: EVENT_ID,
    content,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "提交问卷";

  if (error) {
    alert("提交失败，请稍后重试：" + error.message);
    return;
  }

  successOverlay.classList.add("show");
  saveBasicInfo();
  form.reset();
  collectDateInput.value = todayISODate();
  resetPhotoBlocks();
  loadBasicInfo();
  updateAllPhotoTitles();
}

collectDateInput.value = todayISODate();
loadBasicInfo();
bindBasicInfoAutosave();
addPhotoBlock();
updateAllPhotoTitles();

[collectDateInput, streetCodeInput, buildingNameInput].forEach((el) => {
  el.addEventListener("input", updateAllPhotoTitles);
  el.addEventListener("change", updateAllPhotoTitles);
});

addPhotoBtn.addEventListener("click", () => {
  const block = addPhotoBlock();
  block.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

form.addEventListener("submit", handleSubmit);

function bindExamplePhotos() {
  const modal = document.getElementById("exampleModal");
  const modalImg = document.getElementById("exampleModalImg");
  const modalTitle = document.getElementById("exampleModalTitle");
  const closeBtn = document.getElementById("exampleModalClose");
  if (!modal || !modalImg || !closeBtn) return;

  let lastFocus = null;

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modalImg.removeAttribute("src");
    modalImg.alt = "";
    document.body.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function openModal(src, label) {
    lastFocus = document.activeElement;
    modalTitle.textContent = label || "示例照片";
    modalImg.src = src;
    modalImg.alt = label || "示例照片";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  }

  document.querySelectorAll(".example-photo-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.exampleSrc;
      if (!src) return;
      openModal(src, btn.textContent.trim());
    });
  });

  closeBtn.addEventListener("click", closeModal);
  modal.querySelectorAll("[data-close-example]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });
}

bindExamplePhotos();

function bindPixelGuide() {
  const openBtn = document.getElementById("pixelGuideBtn");
  const modal = document.getElementById("pixelGuideModal");
  const closeBtn = document.getElementById("pixelGuideClose");
  const fileInput = document.getElementById("pixelCheckInput");
  const resultEl = document.getElementById("pixelCheckResult");
  if (!openBtn || !modal || !closeBtn) return;

  let lastFocus = null;
  let objectUrl = "";

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }
    if (fileInput) fileInput.value = "";
    if (resultEl) {
      resultEl.hidden = true;
      resultEl.textContent = "";
      resultEl.classList.remove("ok", "fail");
    }
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  modal.querySelectorAll("[data-close-pixel-guide]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  if (fileInput && resultEl) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      resultEl.classList.remove("ok", "fail");
      if (!file) {
        resultEl.hidden = true;
        resultEl.textContent = "";
        return;
      }

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const longSide = Math.max(w, h);
        const ok = longSide >= 3000;
        resultEl.hidden = false;
        resultEl.classList.add(ok ? "ok" : "fail");
        resultEl.textContent = ok
          ? `尺寸 ${w} × ${h} 像素，长边 ${longSide}，已满足 ≥ 3000 要求。`
          : `尺寸 ${w} × ${h} 像素，长边 ${longSide}，未达到 3000，请换更高分辨率原图。`;
      };
      img.onerror = () => {
        resultEl.hidden = false;
        resultEl.classList.add("fail");
        resultEl.textContent = "无法读取该图片，请换一张再试。";
      };
      img.src = objectUrl;
    });
  }
}

bindPixelGuide();
