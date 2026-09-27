/* ===================================
   DOM ELEMENTS
   =================================== */

const dropArea = document.getElementById('dropArea');
const dropPill = document.getElementById('dropPill');
const fileInput = document.getElementById('fileInput');

const progressContainer = document.getElementById('progressContainer');
const progressFileName = document.getElementById('progressFileName');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');
const progressSize = document.getElementById('progressSize');

const previewGrid = document.getElementById('previewGrid');
const emptyState = document.getElementById('emptyState');
const galleryFoot = document.getElementById('galleryFoot');
const clearAllBtn = document.getElementById('clearAllBtn');
const itemCount = document.getElementById('itemCount');
const refreshBtn = document.getElementById('refreshBtn');

const activityLog = document.getElementById('activityLog');

const toast = document.getElementById('toast');
const toastIcon = document.getElementById('toastIcon');
const toastBody = document.getElementById('toastBody');
const toastClose = document.getElementById('toastClose');

const storageFill = document.getElementById('storageFill');
const storagePercent = document.getElementById('storagePercent');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxName = document.getElementById('lightboxName');
const lightboxClose = document.getElementById('lightboxClose');

const coverPage = document.getElementById('coverPage');
const uploadPage = document.getElementById('uploadPage');
const enterUploadBtn = document.getElementById('enterUploadBtn');

/* ===================================
   CONSTANTS & STATE
   =================================== */

const ALLOWED_TYPES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/gif': 'GIF' };
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const STORAGE_KEY = 'uploadedImages';
const STORAGE_QUOTA_ESTIMATE = 5 * 1024 * 1024; // typical localStorage budget

let isUploading = false;
let toastTimer = null;

/* ===================================
   INIT
   =================================== */

window.addEventListener('load', () => {
    loadImagesFromStorage();
    log('Session started. Drop zone ready.');
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/* ===================================
   DRAG & DROP EVENTS
   =================================== */

dropArea.addEventListener('click', () => fileInput.click());

dropArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
    }
});

dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dropArea.classList.contains('dragover')) {
        dropArea.classList.add('dragover');
        log('Dragover detected on drop zone.');
    }
});

dropArea.addEventListener('dragleave', (e) => {
    if (!dropArea.contains(e.relatedTarget)) {
        dropArea.classList.remove('dragover');
    }
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    log(`Dropped ${files.length} file(s) on the drop zone.`);
    handleFiles(files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
    fileInput.value = '';
});

enterUploadBtn.addEventListener('click', () => {
    coverPage.style.display = 'none';
    uploadPage.style.display = 'grid';
});

lightboxClose.addEventListener('click', () => lightbox.classList.remove('show'));
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.classList.remove('show');
});

/* ===================================
   GALLERY EVENTS
   =================================== */

previewGrid.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
        deleteImage(delBtn.closest('.preview-item').dataset.id);
        return;
    }

    const previewBtn = e.target.closest('.preview-btn');
    const thumbImg = e.target.closest('.preview-thumb img');

    if (previewBtn || thumbImg) {
        const img = e.target.closest('.preview-item').querySelector('.preview-thumb img');
        if (img) {
            lightboxImg.src = img.src;
            lightboxName.textContent = img.alt;
            lightbox.classList.add('show');
        }
    }
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Delete all saved images? This cannot be undone.')) {
        previewGrid.querySelectorAll('.preview-item:not(.is-failed)').forEach((el) => el.remove());
        saveToStorage([]);
        refreshUI();
        showToast('success', 'Cleared', 'All saved images were removed.');
        log('All saved images cleared.');
    }
});

refreshBtn.addEventListener('click', () => {
    previewGrid.innerHTML = '';
    loadImagesFromStorage();
    log('Gallery refreshed from storage.');
    showToast('success', 'Refreshed', 'Gallery reloaded from local storage.');
});
toastClose.addEventListener('click', hideToast);

lightboxClose.addEventListener('click', () => lightbox.classList.remove('show'));
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.classList.remove('show');
});

/* ===================================
   VALIDATION
   =================================== */

function handleFiles(files) {
    if (isUploading) {
        showToast('error', 'Upload in progress', 'Please wait for the current upload to finish.');
        return;
    }
    if (files.length === 0) return;

    const queue = [];

    files.forEach((file) => {
        if (!ALLOWED_TYPES[file.type]) {
            rejectFile(file, 'Invalid file type', `Expected JPG, PNG or GIF, got "${file.type || 'unknown'}".`);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            rejectFile(file, 'File too large', `${formatSize(file.size)} exceeds the 8MB limit.`);
            return;
        }
        queue.push(file);
    });

    if (queue.length > 0) {
        uploadQueue(queue);
    }
}

function rejectFile(file, reason, detail) {
    log(`Uploaded ${file.name || 'file'} — Invalid — ${reason}.`, 'error');
    showToast('error', reason, `The file you dropped is not supported. Only images (JPG, PNG, GIF) can be uploaded.`);
    addFailedCard(file.name || 'unknown file', reason);
}

/* ===================================
   UPLOAD QUEUE (sequential, simulated progress)
   =================================== */

async function uploadQueue(files) {
    isUploading = true;
    let succeeded = 0;

    for (const file of files) {
        await simulateUpload(file);
        try {
            const imageData = await readFileAsImageData(file);
            const stored = getStoredImages();
            stored.push(imageData);

            if (saveToStorage(stored)) {
                displayImage(imageData);
                succeeded++;
                log(`Uploaded ${file.name} — saved to gallery.`, 'success');
            } else {
                addFailedCard(file.name, 'Storage full');
                log(`Uploaded ${file.name} — could not save (storage full).`, 'error');
            }
        } catch (err) {
            addFailedCard(file.name, 'Read error');
            log(`Failed to read ${file.name}.`, 'error');
        }
    }

    isUploading = false;
    progressContainer.classList.remove('show');
    refreshUI();

    if (succeeded > 0) {
        showToast('success', 'Upload complete', `${succeeded} image(s) uploaded successfully.`);
    }
}

function simulateUpload(file) {
    return new Promise((resolve) => {
        progressContainer.classList.add('show');
        progressFileName.textContent = file.name;
        let progress = 0;

        function tick() {
            progress += Math.random() * 22 + 8;
            if (progress >= 100) progress = 100;

            progressFill.style.width = progress + '%';
            progressPercent.textContent = Math.round(progress) + '%';
            progressSize.textContent = `${formatSize(file.size * (progress / 100))} / ${formatSize(file.size)}`;

            if (progress >= 100) {
                log(`Progress simulated for ${file.name}: 100%.`);
                setTimeout(resolve, 200);
            } else {
                setTimeout(tick, 150);
            }
        }

        setTimeout(tick, 150);
    });
}

function readFileAsImageData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize: max width/height 800px rakhte hain
                const MAX_DIM = 800;
                let { width, height } = img;

                if (width > height && width > MAX_DIM) {
                    height = Math.round(height * (MAX_DIM / width));
                    width = MAX_DIM;
                } else if (height > MAX_DIM) {
                    width = Math.round(width * (MAX_DIM / height));
                    height = MAX_DIM;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // GIF ko animation preserve karne ke liye compress nahi karte
                const isGif = file.type === 'image/gif';
                const compressedSrc = isGif
                    ? e.target.result
                    : canvas.toDataURL('image/jpeg', 0.7); // 70% quality

                resolve({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                    name: file.name,
                    type: ALLOWED_TYPES[file.type] || 'IMG',
                    size: file.size,
                    src: compressedSrc
                });
            };
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/* ===================================
   GALLERY RENDERING
   =================================== */

   function displayImage(imageData) {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.dataset.id = imageData.id;

    const thumb = document.createElement('div');
    thumb.className = 'preview-thumb';

    const img = document.createElement('img');
    img.src = imageData.src;
    img.alt = imageData.name;

    const badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.textContent = imageData.type;

    thumb.append(img, badge);

    const caption = document.createElement('div');
    caption.className = 'preview-caption';

    const name = document.createElement('span');
    name.textContent = imageData.name;
    name.title = imageData.name;

    const actions = document.createElement('div');
    actions.className = 'caption-actions';

    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'preview-btn';
    preview.setAttribute('aria-label', `Preview ${imageData.name}`);
    preview.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete-btn';
    del.textContent = '×';
    del.setAttribute('aria-label', `Delete ${imageData.name}`);

    actions.append(preview, del);
    caption.append(name, actions);
    item.append(thumb, caption);
    previewGrid.prepend(item);
}

function addFailedCard(name, reason) {
    const item = document.createElement('div');
    item.className = 'preview-item is-failed';

    const thumb = document.createElement('div');
    thumb.className = 'preview-thumb';
    thumb.innerHTML = `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
            <path d="M14 2v6h6"/>
        </svg>`;

    const caption = document.createElement('div');
    caption.className = 'preview-caption';
    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    nameEl.title = name;
    const reasonEl = document.createElement('span');
    reasonEl.className = 'fail-reason';
    reasonEl.textContent = `Failed — ${reason}`;
    caption.append(nameEl, reasonEl);

    item.append(thumb, caption);
    previewGrid.prepend(item);
    refreshUI();

    // Failed cards are visual-only feedback; clear them after a while
    // so the gallery reflects saved state, not error history.
    setTimeout(() => item.remove(), 8000);
}

function deleteImage(id) {
    const el = previewGrid.querySelector(`.preview-item[data-id="${CSS.escape(String(id))}"]`);
    if (el) el.remove();

    const remaining = getStoredImages().filter((img) => String(img.id) !== String(id));
    saveToStorage(remaining);
    refreshUI();
    log('Deleted one image from the gallery.');
}

/* ===================================
   STORAGE
   =================================== */

function saveToStorage(images) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
        return true;
    } catch (err) {
        console.error('localStorage save failed:', err);
        return false;
    }
}

function getStoredImages() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('localStorage read failed:', err);
        return [];
    }
}

function loadImagesFromStorage() {
    const images = getStoredImages();
    // Preserve original upload order on load (newest still shown first)
    [...images].reverse().forEach(displayImage);
    refreshUI();
}

/* ===================================
   UI HELPERS
   =================================== */

function refreshUI() {
    const images = getStoredImages();
    const count = images.length;

    itemCount.textContent = count;
    emptyState.classList.toggle('show', count === 0 && !previewGrid.querySelector('.preview-item'));
    galleryFoot.classList.toggle('show', count > 0);

    const bytesUsed = JSON.stringify(images).length;
    const pct = Math.min(100, Math.round((bytesUsed / STORAGE_QUOTA_ESTIMATE) * 100));
    storageFill.style.width = pct + '%';
    storagePercent.textContent = `${pct}% used`;
}

function formatSize(bytes) {
    if (bytes < 1024) return `${Math.round(bytes)}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function log(message, kind) {
    const li = document.createElement('li');
    if (kind) li.classList.add(`is-${kind}`);

    const time = new Date();
    const ts = time.toTimeString().slice(0, 8);

    const tsSpan = document.createElement('span');
    tsSpan.className = 'ts';
    tsSpan.textContent = `[${ts}] `;

    li.append(tsSpan, document.createTextNode(message));
    activityLog.prepend(li);

    // Keep the log from growing without bound
    while (activityLog.children.length > 40) {
        activityLog.removeChild(activityLog.lastChild);
    }
}

let toastKindClass = '';
function showToast(kind, title, body) {
    clearTimeout(toastTimer);

    toast.classList.remove('is-success', 'is-error');
    if (kind === 'success') {
        toast.classList.add('is-success');
        toastIcon.textContent = '✓';
    } else {
        toast.classList.add('is-error');
        toastIcon.textContent = '!';
    }

    toastBody.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const p = document.createTextNode(body);
    toastBody.append(strong, p);

    toast.classList.add('show');
    toastTimer = setTimeout(hideToast, kind === 'error' ? 6000 : 3500);
}

function hideToast() {
    toast.classList.remove('show');
    clearTimeout(toastTimer);
}