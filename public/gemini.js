// gemini.js

// ====== Configuration ======
const GEMINI_MODELS = {
    CHAT_DEFAULT: 'gemini-3-pro-preview',
    IMAGE: 'gemini-3-pro-image-preview'   
};

const CHAT_MODEL_OPTIONS = {
    GEMINI3: {
        value: 'gemini-3-pro-preview',
        label: 'Gemini 3 Pro (preview)'
    },
    GEMINI25: {
        value: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro'
    }
};

const CHAT_ROOMS_KEY = 'gemini_chat_rooms';
const CHAT_ACTIVE_ROOM_KEY = 'gemini_active_chat_room';
const CHAT_ROOMS_PAGE_SIZE = 5;

function getThinkingConfigForModel(model) {
    if (!model) return null;
    if (model.startsWith('gemini-3')) return { thinkingLevel: "high" };
    if (model.startsWith('gemini-2.5')) return { thinkingBudget: 5000 };
    return null;
}

// API 서버 주소 자동 설정
const currentPort = window.location.port;
const API_BASE_URL = (currentPort === '5500' || currentPort === '5501') 
    ? `${window.location.protocol}//${window.location.hostname}:3000` 
    : '';

// ====== Token Stats Variables ======
let tokenStats = {
    totalPromptTokens: 0, totalCachedTokens: 0, totalOutputTokens: 0,
    totalRequests: 0, sessionStartTime: new Date(), totalBilledTokens: 0, totalCostUSD: 0
};

const state = {
    googleApiKey: localStorage.getItem('google_api_key') || '',
    chatModel: localStorage.getItem('gemini_chat_model') || GEMINI_MODELS.CHAT_DEFAULT,
    chatRooms: [],
    activeChatRoomId: null,
    chatRoomPage: 0,
    mode: 'thumbnail', 
    chatHistory: [],
    attachedChatImage: null, 
    attachedThumbImage: null,
    composeBackground: null,
    composeCharacters: [], // [{name, dataURL}]
    composeResults: [],     // [{data, filename, sourceName}]
    composeAbort: false,
    testBackground: null,
    testCharacters: [],     // [{name,dataURL,cutout}]
    testCanvas: null
};

// ====== Initialization ======
document.addEventListener('DOMContentLoaded', () => {
    normalizeChatModel();
    loadChatRooms();
    ensureActiveChatRoom();
    if (state.googleApiKey) {
        const el = document.getElementById('googleApiKey');
        if(el) el.value = state.googleApiKey;
    }
    initEventListeners();
    updateView();
    renderChatHistoryFromState();
});

// ====== Event Listeners ======
function initEventListeners() {
    // API Key Save
    const btnSaveKey = document.getElementById('saveGoogleKey');
    if(btnSaveKey) {
        btnSaveKey.addEventListener('click', () => {
            const key = document.getElementById('googleApiKey').value.trim();
            if (!key) return alert('API 키를 입력해주세요.');
            state.googleApiKey = key;
            localStorage.setItem('google_api_key', key);
            alert('Google API 키가 저장되었습니다.');
        });
    }

    // Mode Switching
    const cardThumb = document.getElementById('cardThumbnail');
    const cardChat = document.getElementById('cardChat');
    const cardCompose = document.getElementById('cardCompose');
    const cardTest = document.getElementById('cardTest');
    if(cardThumb) cardThumb.addEventListener('click', () => setMode('thumbnail'));
    if(cardChat) cardChat.addEventListener('click', () => setMode('chat'));
    if(cardCompose) cardCompose.addEventListener('click', () => setMode('compose'));
    if(cardTest) cardTest.addEventListener('click', () => setMode('test'));

    // --- Thumbnail (Nano Banana) ---
    const btnGenThumb = document.getElementById('btnGenerateThumb');
    if(btnGenThumb) btnGenThumb.addEventListener('click', generateThumbnail);

    // 이미지 업로드 로직 (안전장치 추가)
    const thumbInput = document.getElementById('thumbImageInput');
    const btnAttachThumb = document.getElementById('btnAttachThumbImage');
    
    if(thumbInput) {
        // 파일 선택 시 핸들러
        thumbInput.addEventListener('change', (e) => handleImageUpload(e, 'thumb'));
        
        // 버튼 클릭 시 (HTML onclick 백업이 있지만 JS로도 연결)
        if(btnAttachThumb) {
            btnAttachThumb.addEventListener('click', () => {
                thumbInput.value = ''; // 같은 파일 다시 선택 가능하게 초기화
                thumbInput.click();
            });
        }
    } else {
        console.error('오류: thumbImageInput 요소를 찾을 수 없습니다.');
    }

    const btnRemoveThumb = document.getElementById('removeThumbImage');
    if(btnRemoveThumb) btnRemoveThumb.addEventListener('click', () => clearImage('thumb'));


    // --- Chat ---
    const chatInput = document.getElementById('chatImageInput');
    const btnAttachChat = document.getElementById('btnAttachImage');
    if(chatInput) {
        chatInput.addEventListener('change', (e) => handleImageUpload(e, 'chat'));
        if(btnAttachChat) {
            btnAttachChat.addEventListener('click', () => {
                chatInput.value = '';
                chatInput.click();
            });
        }
    }

    const btnRemoveChat = document.getElementById('removeChatImage');
    if(btnRemoveChat) btnRemoveChat.addEventListener('click', () => clearImage('chat'));

    const btnSendChat = document.getElementById('btnSendChat');
    if(btnSendChat) btnSendChat.addEventListener('click', sendChatMessage);
    
    const chatPrompt = document.getElementById('chatPrompt');
    if(chatPrompt) {
        chatPrompt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    const chatModelSelect = document.getElementById('chatModelSelect');
    if (chatModelSelect) {
        chatModelSelect.value = state.chatModel;
        chatModelSelect.addEventListener('change', (e) => {
            state.chatModel = e.target.value;
            localStorage.setItem('gemini_chat_model', state.chatModel);
            syncChatModelUI();
            renderChatHistoryFromState();
        });
    }

    const chatRoomList = document.getElementById('chatRoomList');
    if (chatRoomList) {
        chatRoomList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('[data-action="delete"]');
            const item = e.target.closest('.chat-room-item');
            if (!item) return;
            const roomId = item.dataset.id;
            if (deleteBtn) {
                deleteChatRoom(roomId);
            } else {
                setActiveChatRoom(roomId);
            }
        });
    }

    const btnChatRoomPrev = document.getElementById('chatRoomPrev');
    const btnChatRoomNext = document.getElementById('chatRoomNext');
    if (btnChatRoomPrev) btnChatRoomPrev.addEventListener('click', () => {
        if (state.chatRoomPage > 0) {
            state.chatRoomPage -= 1;
            renderChatRooms();
        }
    });
    if (btnChatRoomNext) btnChatRoomNext.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(state.chatRooms.length / CHAT_ROOMS_PAGE_SIZE));
        if (state.chatRoomPage < totalPages - 1) {
            state.chatRoomPage += 1;
            renderChatRooms();
        }
    });

    const btnCreateChatRoom = document.getElementById('createChatRoom');
    if (btnCreateChatRoom) btnCreateChatRoom.addEventListener('click', () => {
        startNewChatSession();
        renderChatHistoryFromState();
    });

    // --- Compose Mode ---
    const btnAttachBg = document.getElementById('btnAttachComposeBg');
    const bgInput = document.getElementById('composeBgInput');
    const btnRemoveBg = document.getElementById('btnRemoveComposeBg');
    if(btnAttachBg && bgInput) {
        btnAttachBg.addEventListener('click', () => { bgInput.value = ''; bgInput.click(); });
        bgInput.addEventListener('change', (e) => handleComposeBgUpload(e));
    }
    if(btnRemoveBg) btnRemoveBg.addEventListener('click', clearComposeBackground);

    const btnAttachChars = document.getElementById('btnAttachComposeChars');
    const charInput = document.getElementById('composeCharInput');
    const btnClearChars = document.getElementById('btnClearComposeChars');
    if(btnAttachChars && charInput) {
        btnAttachChars.addEventListener('click', () => { charInput.value=''; charInput.click(); });
        charInput.addEventListener('change', (e) => handleComposeCharUpload(e));
    }
    if(btnClearChars) btnClearChars.addEventListener('click', clearComposeCharacters);

    const btnGenerateCompose = document.getElementById('btnGenerateCompose');
    if(btnGenerateCompose) btnGenerateCompose.addEventListener('click', generateComposites);
    const btnStopCompose = document.getElementById('btnStopCompose');
    if(btnStopCompose) btnStopCompose.addEventListener('click', () => { state.composeAbort = true; setComposeStatus('중단 요청됨'); });

    const btnDownloadAllCompose = document.getElementById('btnDownloadAllCompose');
    if(btnDownloadAllCompose) btnDownloadAllCompose.addEventListener('click', downloadAllComposites);

    // --- Test Mode ---
    const btnAttachTestBg = document.getElementById('btnAttachTestBg');
    const testBgInput = document.getElementById('testBgInput');
    const btnRemoveTestBg = document.getElementById('btnRemoveTestBg');
    if(btnAttachTestBg && testBgInput) {
        btnAttachTestBg.addEventListener('click', () => { testBgInput.value=''; testBgInput.click(); });
        testBgInput.addEventListener('change', handleTestBgUpload);
    }
    if(btnRemoveTestBg) btnRemoveTestBg.addEventListener('click', clearTestBackground);

    const btnAttachTestChars = document.getElementById('btnAttachTestChars');
    const testCharInput = document.getElementById('testCharInput');
    const btnClearTestChars = document.getElementById('btnClearTestChars');
    if(btnAttachTestChars && testCharInput) {
        btnAttachTestChars.addEventListener('click', () => { testCharInput.value=''; testCharInput.click(); });
        testCharInput.addEventListener('change', handleTestCharUpload);
    }
    if(btnClearTestChars) btnClearTestChars.addEventListener('click', clearTestCharacters);

    const btnCutoutTest = document.getElementById('btnCutoutTest');
    if(btnCutoutTest) btnCutoutTest.addEventListener('click', cutoutTestCharacters);

    const btnAddAllTest = document.getElementById('btnAddAllTest');
    if(btnAddAllTest) btnAddAllTest.addEventListener('click', addAllTestCharactersToCanvas);

    const btnResetCanvas = document.getElementById('btnResetCanvas');
    if(btnResetCanvas) btnResetCanvas.addEventListener('click', resetTestCanvasObjects);

    const btnDownloadTest = document.getElementById('btnDownloadTest');
    if(btnDownloadTest) btnDownloadTest.addEventListener('click', downloadTestCanvas);

    const btnAutoCompose = document.getElementById('btnAutoCompose');
    if(btnAutoCompose) btnAutoCompose.addEventListener('click', autoComposeByLayout);
    const btnAutoComposePerChar = document.getElementById('btnAutoComposePerChar');
    if(btnAutoComposePerChar) btnAutoComposePerChar.addEventListener('click', autoComposePerCharacter);
}

// ====== Helper Functions ======
function setMode(mode) {
    state.mode = mode;
    updateView();
    if(mode === 'test') ensureTestCanvas();
}

function updateView() {
    const isThumb = state.mode === 'thumbnail';
    const isChat = state.mode === 'chat';
    const isCompose = state.mode === 'compose';
    const isTest = state.mode === 'test';
    const el = (id) => document.getElementById(id);
    
    if(el('cardThumbnail')) el('cardThumbnail').classList.toggle('active', isThumb);
    if(el('cardChat')) el('cardChat').classList.toggle('active', isChat);
    if(el('cardCompose')) el('cardCompose').classList.toggle('active', isCompose);
    if(el('cardTest')) el('cardTest').classList.toggle('active', isTest);

    if(el('viewThumbnail')) el('viewThumbnail').classList.toggle('hidden', !isThumb);
    if(el('viewChat')) el('viewChat').classList.toggle('hidden', !isChat);
    if(el('viewCompose')) el('viewCompose').classList.toggle('hidden', !isCompose);
    if(el('viewTest')) el('viewTest').classList.toggle('hidden', !isTest);

    if(el('thumbnailSettings')) el('thumbnailSettings').classList.toggle('hidden', !isThumb);
    if(el('chatSettings')) el('chatSettings').classList.toggle('hidden', !isChat);
    if(el('composeSettings')) el('composeSettings').classList.toggle('hidden', !isCompose);
    if(el('testSettings')) el('testSettings').classList.toggle('hidden', !isTest);

    if (isChat) {
        const chatModelSelect = document.getElementById('chatModelSelect');
        if (chatModelSelect) chatModelSelect.value = state.chatModel;
    }
    syncChatModelUI();
    renderChatRooms();
    if (isChat) renderChatHistoryFromState();
}

function normalizeChatModel() {
    const validValues = Object.values(CHAT_MODEL_OPTIONS).map(o => o.value);
    if (!validValues.includes(state.chatModel)) {
        state.chatModel = GEMINI_MODELS.CHAT_DEFAULT;
        localStorage.setItem('gemini_chat_model', state.chatModel);
    }
}

function loadChatRooms() {
    try {
        const stored = localStorage.getItem(CHAT_ROOMS_KEY);
        state.chatRooms = stored ? JSON.parse(stored) : [];
    } catch {
        state.chatRooms = [];
    }
    const active = localStorage.getItem(CHAT_ACTIVE_ROOM_KEY);
    state.activeChatRoomId = active || (state.chatRooms[0]?.id || null);
    state.chatRoomPage = 0;
}

function saveChatRooms() {
    localStorage.setItem(CHAT_ROOMS_KEY, JSON.stringify(state.chatRooms));
    if (state.activeChatRoomId) localStorage.setItem(CHAT_ACTIVE_ROOM_KEY, state.activeChatRoomId);
}

function ensureActiveChatRoom() {
    if (!state.chatRooms.length) {
        state.chatHistory = [];
        state.activeChatRoomId = null;
        return null;
    }
    let room = state.chatRooms.find(r => r.id === state.activeChatRoomId);
    if (!room) {
        room = state.chatRooms[0];
        state.activeChatRoomId = room.id;
        localStorage.setItem(CHAT_ACTIVE_ROOM_KEY, room.id);
    }
    state.chatHistory = room.history || [];
    return room;
}

function getActiveChatRoom() {
    return state.chatRooms.find(r => r.id === state.activeChatRoomId) || null;
}

function startNewChatSession() {
    // "새 채팅 생성" 버튼으로만 새 방 생성
    const room = createChatRoom('새 채팅');
    state.chatHistory = [];
    state.activeChatRoomId = room.id;
    localStorage.setItem(CHAT_ACTIVE_ROOM_KEY, room.id);
    saveChatRooms();
}

function createChatRoom(title) {
    const room = {
        id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: title || '새 채팅',
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    state.chatRooms.unshift(room);
    state.activeChatRoomId = room.id;
    state.chatRoomPage = 0;
    saveChatRooms();
    renderChatRooms();
    return room;
}

function setActiveChatRoom(roomId) {
    const room = state.chatRooms.find(r => r.id === roomId);
    if (!room) return;
    state.activeChatRoomId = roomId;
    state.chatHistory = room.history ? [...room.history] : [];
    localStorage.setItem(CHAT_ACTIVE_ROOM_KEY, roomId);
    renderChatRooms();
    renderChatHistoryFromState();
}

function deleteChatRoom(roomId) {
    state.chatRooms = state.chatRooms.filter(r => r.id !== roomId);
    if (state.activeChatRoomId === roomId) {
        state.activeChatRoomId = state.chatRooms[0]?.id || null;
        state.chatHistory = state.chatRooms[0]?.history || [];
    }
    saveChatRooms();
    renderChatRooms();
    renderChatHistoryFromState();
}

function updateRoomTitle(room, text) {
    const clean = (text || '').trim();
    if (!clean) return;
    if (!room.title || room.title === '새 채팅') {
        room.title = clean.slice(0, 30);
    }
}

function sortRoomsByUpdated() {
    state.chatRooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function getChatModelLabel(modelValue) {
    const match = Object.values(CHAT_MODEL_OPTIONS).find(opt => opt.value === modelValue);
    return match ? match.label : modelValue;
}

function syncChatModelUI() {
    const label = getChatModelLabel(state.chatModel);
    const badge = document.getElementById('chatModelBadge');
    if (badge) badge.textContent = label;
    const sub = document.getElementById('chatCardSubtitle');
    if (sub) sub.textContent = label;
}

function renderChatRooms() {
    const listEl = document.getElementById('chatRoomList');
    const pageInfo = document.getElementById('chatRoomPageInfo');
    const prevBtn = document.getElementById('chatRoomPrev');
    const nextBtn = document.getElementById('chatRoomNext');
    if (!listEl) return;

    sortRoomsByUpdated();

    const total = state.chatRooms.length;
    const totalPages = Math.max(1, Math.ceil(total / CHAT_ROOMS_PAGE_SIZE));
    state.chatRoomPage = Math.min(state.chatRoomPage, totalPages - 1);
    const start = state.chatRoomPage * CHAT_ROOMS_PAGE_SIZE;
    const slice = state.chatRooms.slice(start, start + CHAT_ROOMS_PAGE_SIZE);

    listEl.innerHTML = '';
    if (!slice.length) {
        listEl.innerHTML = '<div class="chat-room-empty">새 채팅 생성 버튼으로 채팅방을 추가할 수 있습니다.</div>';
    } else {
        slice.forEach(room => {
            const div = document.createElement('div');
            div.className = `chat-room-item${room.id === state.activeChatRoomId ? ' active' : ''}`;
            div.dataset.id = room.id;
            const updated = room.updatedAt ? new Date(room.updatedAt).toLocaleString('ko-KR', { hour12: false }) : '';
            div.innerHTML = `
                <div class="chat-room-meta">
                    <div class="chat-room-title">${escapeHtml(room.title || '새 채팅')}</div>
                    <div class="chat-room-sub">${updated}</div>
                </div>
                <button class="btn btn-outline btn-sm" data-action="delete">삭제</button>
            `;
            listEl.appendChild(div);
        });
    }

    if (pageInfo) pageInfo.textContent = `${state.chatRoomPage + 1} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.chatRoomPage <= 0;
    if (nextBtn) nextBtn.disabled = state.chatRoomPage >= totalPages - 1;
}

function handleImageUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const result = ev.target.result;
        if (type === 'chat') {
            state.attachedChatImage = result;
            document.getElementById('chatImagePreview').src = result;
            document.getElementById('imagePreviewArea').classList.remove('hidden');
        } else {
            state.attachedThumbImage = result;
            document.getElementById('thumbImagePreview').src = result;
            document.getElementById('thumbImagePreviewArea').classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);
}

function clearImage(type) {
    if (type === 'chat') {
        state.attachedChatImage = null;
        document.getElementById('chatImageInput').value = '';
        document.getElementById('imagePreviewArea').classList.add('hidden');
    } else {
        state.attachedThumbImage = null;
        document.getElementById('thumbImageInput').value = '';
        document.getElementById('thumbImagePreviewArea').classList.add('hidden');
    }
}

// ====== Test Upload Helpers ======
function handleTestBgUpload(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        state.testBackground = { name: file.name, dataURL: ev.target.result };
        setTestBackgroundOnCanvas(ev.target.result);
        renderTestLists();
    };
    reader.readAsDataURL(file);
}

function handleTestCharUpload(e) {
    const files = Array.from(e.target.files || []);
    if(!files.length) return;
    const promises = files.map(file => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = (ev) => resolve({ name: file.name, dataURL: ev.target.result, cutout: null });
        fr.onerror = reject;
        fr.readAsDataURL(file);
    }));
    Promise.all(promises).then(list => {
        state.testCharacters.push(...list);
        renderTestLists();
    }).catch(err => console.error('업로드 실패:', err));
}

function clearTestBackground() {
    state.testBackground = null;
    setTestBackgroundOnCanvas(null);
    renderTestLists();
}

function clearTestCharacters() {
    state.testCharacters = [];
    renderTestLists();
}

function removeTestCharacter(idx) {
    state.testCharacters.splice(idx,1);
    renderTestLists();
}

function renderTestLists() {
    const bg = document.getElementById('testBgPreview');
    const list = document.getElementById('testCharList');
    if(bg) {
        bg.innerHTML = '';
        if(state.testBackground) {
            const img = document.createElement('img');
            img.src = state.testBackground.dataURL;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '6px';
            img.style.border = '1px solid var(--border-color)';
            bg.classList.remove('empty-box');
            bg.appendChild(img);
        } else {
            bg.classList.add('empty-box');
            bg.innerHTML = '<span class="muted">배경 이미지가 없습니다.</span>';
        }
    }
    if(list) {
        list.innerHTML = '';
        if(!state.testCharacters.length) {
            list.classList.add('empty-box');
            list.innerHTML = '<span class="muted">캐릭터 이미지를 추가해주세요.</span>';
        } else {
            list.classList.remove('empty-box');
            state.testCharacters.forEach((c, idx) => {
                const div = document.createElement('div');
                div.className = 'thumb';
                div.innerHTML = `
                    <img src="${c.cutout ? `data:image/png;base64,${c.cutout}` : c.dataURL}" alt="${c.name}">
                    <button class="remove" title="삭제">✕</button>
                `;
                div.querySelector('.remove').addEventListener('click', () => removeTestCharacter(idx));
                list.appendChild(div);
            });
        }
    }
}

async function cutoutTestCharacters() {
    if(!state.testCharacters.length) return alert('캐릭터 이미지를 추가해주세요.');
    const removeBackground = await loadBackgroundRemoval();
    if(!removeBackground) return;
    setTestStatus(`배경 제거 중... (총 ${state.testCharacters.length}장)`);
    for(let i=0;i<state.testCharacters.length;i++){
        const c = state.testCharacters[i];
        setTestStatus(`배경 제거 중 (${i+1}/${state.testCharacters.length})`);
        if(c.cutout) continue;
        try {
            const blob = await fetch(c.dataURL).then(r => r.blob());
            const resultBlob = await removeBackground(blob, { output: { format: "image/png" } });
            const cutoutDataURL = await blobToDataURL(resultBlob);
            c.cutout = cutoutDataURL.split(',')[1]; // base64 only
        } catch (err) {
            console.error(err);
            alert(`배경 제거 실패: ${c.name}`);
        }
    }
    renderTestLists();
    setTestStatus('배경 제거 완료. 캔버스에 배치하세요.');
}

function addAllTestCharactersToCanvas() {
    if(!state.testCanvas) ensureTestCanvas();
    if(!state.testCharacters.length) return alert('캐릭터 이미지를 추가해주세요.');
    state.testCharacters.forEach(c => {
        if(c.cutout) addCharacterToCanvas(c);
    });
}

function ensureTestCanvas() {
    if(state.testCanvas) return state.testCanvas;
    if(!window.fabric) { 
        setTestStatus('fabric.js가 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.');
        return null; 
    }
    const canvasEl = document.getElementById('testCanvas');
    const canvas = new fabric.Canvas(canvasEl, { preserveObjectStacking: true });
    canvas.setWidth(960);
    canvas.setHeight(540);
    state.testCanvas = canvas;
    return canvas;
}

function setTestBackgroundOnCanvas(dataURL) {
    const canvas = ensureTestCanvas();
    if(!canvas) return;
    if(!dataURL) {
        canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
        return;
    }
    fabric.Image.fromURL(dataURL, (img) => {
        const maxW = 1200, maxH = 800;
        let w = img.width, h = img.height;
        const scale = Math.min(maxW / w, maxH / h, 1);
        w *= scale; h *= scale;
        canvas.setWidth(w); canvas.setHeight(h);
        img.scaleToWidth(w);
        img.scaleToHeight(h);
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), { originX:'left', originY:'top' });
    }, { crossOrigin: 'anonymous' });
}

// background 설정을 Promise로 기다릴 수 있는 버전
function setTestBackgroundOnCanvasAsync(dataURL) {
    return new Promise((resolve) => {
        const canvas = ensureTestCanvas();
        if(!canvas) return resolve();
        if(!dataURL) {
            canvas.setBackgroundImage(null, () => { canvas.renderAll(); resolve(); });
            return;
        }
        fabric.Image.fromURL(dataURL, (img) => {
            const maxW = 1200, maxH = 800;
            let w = img.width, h = img.height;
            const scale = Math.min(maxW / w, maxH / h, 1);
            w *= scale; h *= scale;
            canvas.setWidth(w); canvas.setHeight(h);
            img.scaleToWidth(w);
            img.scaleToHeight(h);
            canvas.setBackgroundImage(img, () => { canvas.renderAll(); resolve(); }, { originX:'left', originY:'top' });
        }, { crossOrigin: 'anonymous' });
    });
}

function addCharacterToCanvas(charObj) {
    const canvas = ensureTestCanvas();
    if(!canvas || !charObj.cutout) return;
    fabric.Image.fromURL(`data:image/png;base64,${charObj.cutout}`, (img) => {
        img.set({
            left: canvas.getWidth()/2,
            top: canvas.getHeight()/2,
            originX: 'center',
            originY: 'center',
            selectable: true
        });
        const scale = Math.min(canvas.getWidth()/img.width, canvas.getHeight()/img.height, 0.8);
        img.scale(scale);
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
    }, { crossOrigin: 'anonymous' });
}

function resetTestCanvasObjects() {
    const canvas = ensureTestCanvas();
    if(!canvas) return;
    canvas.getObjects().forEach(obj => { if(obj !== canvas.backgroundImage) canvas.remove(obj); });
    canvas.discardActiveObject();
    canvas.renderAll();
    setTestStatus('캔버스를 초기화했습니다.');
}

async function downloadTestCanvas() {
    const canvas = ensureTestCanvas();
    if(!canvas) return;
    const dataURL = canvas.toDataURL({ format:'png' });
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `manual_compose_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function setTestStatus(text) {
    const el = document.getElementById('testStatus');
    if(el) el.textContent = text || '';
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function parseResolutionToAspect(val) {
    if(!val) return '1:1';
    if(val.includes('x')) {
        const [w,h] = val.split('x').map(Number);
        if(w && h) return `${w}:${h}`;
    }
    return val;
}

// 동적으로 @imgly/background-removal 로더
let backgroundRemovalPromise = null;
function loadBackgroundRemoval() {
    if (window._imglyRemoveBackground) return Promise.resolve(window._imglyRemoveBackground);
    if (backgroundRemovalPromise) return backgroundRemovalPromise;
    const primaryUrl = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/index.mjs';
    const fallbackUrl = 'https://unpkg.com/@imgly/background-removal@1.7.0/dist/index.mjs';

    const load = async (url) => {
        const mod = await import(/* webpackIgnore: true */ url);
        return mod.removeBackground;
    };

    backgroundRemovalPromise = load(primaryUrl)
        .catch(() => load(fallbackUrl))
        .then(fn => {
            window._imglyRemoveBackground = fn;
            return fn;
        })
        .catch(err => {
            console.error('배경 제거 라이브러리 로드 실패', err);
            alert('배경 제거 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하거나 새로고침 해주세요.');
            return null;
        });
    return backgroundRemovalPromise;
}

// ====== Auto Compose by preset layout (단일 좌표를 모든 캐릭터에 적용) ======
function parseSingleLayout() {
    const textarea = document.getElementById('testLayoutConfig');
    if(!textarea) return { x:50, y:60, scale:100 };
    try {
        const parsed = JSON.parse(textarea.value);
        if(Array.isArray(parsed) && parsed.length) {
            const p = parsed[0];
            if(typeof p.x==='number' && typeof p.y==='number') {
                return { x:p.x, y:p.y, scale: typeof p.scale==='number' ? p.scale : 100 };
            }
        }
    } catch (e) {
        console.error('레이아웃 파싱 실패', e);
    }
    return { x:50, y:60, scale:100 };
}

function autoComposeByLayout() {
    // 단일 레이아웃을 모든 캐릭터에 적용, 각 캐릭터별로 한 장씩 합성 → ZIP
    autoComposePerCharacter();
}

function addCharacterToCanvasWithLayout(charObj, layout) {
    const canvas = ensureTestCanvas();
    if(!canvas || !charObj.cutout || !layout) return;
    fabric.Image.fromURL(`data:image/png;base64,${charObj.cutout}`, (img) => {
        img.set({
            originX: 'center',
            originY: 'center',
            selectable: true
        });
        const scale = (layout.scale ? layout.scale : 100) / 100;
        img.scale(scale);
        const x = (layout.x/100) * canvas.getWidth();
        const y = (layout.y/100) * canvas.getHeight();
        img.set({ left: x, top: y });
        canvas.add(img);
        canvas.renderAll();
    }, { crossOrigin: 'anonymous' });
}

async function autoComposePerCharacter() {
    if(!state.testCharacters.length) return alert('캐릭터 이미지를 추가해주세요.');
    const layout = parseSingleLayout();
    const canvas = ensureTestCanvas();
    if(!canvas) return;
    if(!state.testBackground) return alert('배경 이미지를 업로드해주세요.');
    const pending = state.testCharacters.filter(c => !c.cutout);
    if(pending.length) return alert('배경 제거가 완료되지 않은 캐릭터가 있습니다. ✂️ 배경 제거 후 다시 시도하세요.');

    const zip = new JSZip();
    const bgDataURL = state.testBackground.dataURL;
    setTestStatus('캐릭터별 합성 중...');

    for(let i=0;i<state.testCharacters.length;i++){
        const char = state.testCharacters[i];
        resetTestCanvasObjects();
        await setTestBackgroundOnCanvasAsync(bgDataURL);
        await addCharacterToCanvasWithLayoutPromise(char, layout);
        const dataURL = canvas.toDataURL({ format:'png' });
        zip.file(`compose_${i+1}_${char.name||'character'}.png`, dataURL.split(',')[1], { base64:true });
    }

    const content = await zip.generateAsync({ type:'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `per_character_compose_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTestStatus('캐릭터별 합성이 완료되었습니다.');
}

function addCharacterToCanvasWithLayoutPromise(charObj, layout) {
    const canvas = ensureTestCanvas();
    if(!canvas || !charObj.cutout || !layout) return Promise.resolve();
    return new Promise(resolve => {
        fabric.Image.fromURL(`data:image/png;base64,${charObj.cutout}`, (img) => {
            img.set({
                originX: 'center',
                originY: 'center',
                selectable: false
            });
            const scale = (layout.scale ? layout.scale : 100) / 100;
            img.scale(scale);
            const x = (layout.x/100) * canvas.getWidth();
            const y = (layout.y/100) * canvas.getHeight();
            img.set({ left: x, top: y });
            canvas.add(img);
            canvas.renderAll();
            resolve();
        }, { crossOrigin: 'anonymous' });
    });
}

// ====== Compose Upload Helpers ======
function handleComposeBgUpload(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        state.composeBackground = { name: file.name, dataURL: ev.target.result };
        renderComposePreviews();
    };
    reader.readAsDataURL(file);
}

function handleComposeCharUpload(e) {
    const files = Array.from(e.target.files || []);
    if(!files.length) return;
    const promises = files.map(file => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = (ev) => resolve({ name: file.name, dataURL: ev.target.result });
        fr.onerror = reject;
        fr.readAsDataURL(file);
    }));
    Promise.all(promises).then(list => {
        state.composeCharacters.push(...list);
        renderComposePreviews();
    }).catch(err => console.error('업로드 실패:', err));
}

function clearComposeBackground() {
    state.composeBackground = null;
    renderComposePreviews();
}

function clearComposeCharacters() {
    state.composeCharacters = [];
    renderComposePreviews();
}

function removeComposeCharacter(idx) {
    state.composeCharacters.splice(idx, 1);
    renderComposePreviews();
}

function renderComposePreviews() {
    const bg = document.getElementById('composeBgPreview');
    const list = document.getElementById('composeCharList');
    if(bg) {
        bg.innerHTML = '';
        if(state.composeBackground) {
            const img = document.createElement('img');
            img.src = state.composeBackground.dataURL;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '6px';
            img.style.border = '1px solid var(--border-color)';
            bg.classList.remove('empty-box');
            bg.appendChild(img);
        } else {
            bg.classList.add('empty-box');
            bg.innerHTML = '<span class="muted">배경 이미지가 없습니다.</span>';
        }
    }
    if(list) {
        list.innerHTML = '';
        if(!state.composeCharacters.length) {
            list.classList.add('empty-box');
            list.innerHTML = '<span class="muted">캐릭터 이미지를 추가해주세요.</span>';
        } else {
            list.classList.remove('empty-box');
            state.composeCharacters.forEach((c, idx) => {
                const div = document.createElement('div');
                div.className = 'thumb';
                div.innerHTML = `
                    <img src="${c.dataURL}" alt="${c.name}">
                    <button class="remove" title="삭제">✕</button>
                `;
                div.querySelector('.remove').addEventListener('click', () => removeComposeCharacter(idx));
                list.appendChild(div);
            });
        }
    }
}

// ====== Thumbnail Generation ======
async function generateThumbnail() {
    if (!state.googleApiKey) return alert('Google API 키를 먼저 설정해주세요.');
    const prompt = document.getElementById('thumbPrompt').value.trim();
    
    // 프롬프트나 이미지가 있어야 함
    if (!prompt && !state.attachedThumbImage) return alert('프롬프트 또는 이미지를 입력해주세요.');

    const resolution = document.getElementById('thumbResolution').value; 
    const aspectRatio = parseResolutionToAspect(resolution);
    
    const loading = document.getElementById('thumbLoading');
    const previewImg = document.getElementById('generatedImage');
    const placeholder = document.querySelector('.thumb-preview .placeholder');

    if(loading) loading.classList.remove('hidden');
    if(previewImg) previewImg.classList.add('hidden');
    if(placeholder) placeholder.classList.add('hidden');

    try {
        const imageBase64 = state.attachedThumbImage ? state.attachedThumbImage.split(',')[1] : null;

        const response = await fetch(`${API_BASE_URL}/api/gemini/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: state.googleApiKey,
                prompt: prompt,
                image: imageBase64, // 나노바나나에게 이미지 전송
                aspectRatio: aspectRatio,
                model: GEMINI_MODELS.IMAGE
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || '이미지 생성 실패');
        }

        const data = await response.json();
        
        if (data.usageMetadata) {
            logTokenUsage(data.usageMetadata, "이미지생성");
        }

        if(previewImg) {
            previewImg.src = `data:image/png;base64,${data.image}`;
            previewImg.classList.remove('hidden');
        }
    } catch (error) {
        console.error(error);
        alert('오류 발생: ' + error.message);
        if(placeholder) placeholder.classList.remove('hidden');
    } finally {
        if(loading) loading.classList.add('hidden');
    }
}

// ====== Compose (Background + Characters) ======
async function generateComposites() {
    if (!state.googleApiKey) return alert('Google API 키를 먼저 설정해주세요.');
    if (!state.composeBackground) return alert('배경 이미지를 업로드해주세요.');
    if (!state.composeCharacters.length) return alert('캐릭터 이미지를 한 장 이상 업로드해주세요.');

    const prompt = document.getElementById('composePrompt').value.trim();
    const resolution = document.getElementById('composeResolution').value;
    const aspectRatio = parseResolutionToAspect(resolution);
    const statusEl = document.getElementById('composeStatus');
    const btn = document.getElementById('btnGenerateCompose');

    btn.disabled = true;
    state.composeAbort = false;
    setComposeStatus(`생성 중... (총 ${state.composeCharacters.length}장)`);

    const bgBase64 = state.composeBackground.dataURL.split(',')[1];
    state.composeResults = [];
    renderComposeResults();

    for (let i = 0; i < state.composeCharacters.length; i++) {
        if(state.composeAbort) { setComposeStatus('중단됨'); break; }
        const character = state.composeCharacters[i];
        setComposeStatus(`캐릭터 ${i+1}/${state.composeCharacters.length} 처리 중...`);
        let success = false;
        let attempt = 0;
        while(!success && !state.composeAbort) {
            attempt++;
            try {
                const charBase64 = character.dataURL.split(',')[1];
                const combinedPrompt = [
                    'Use the first image strictly as BACKGROUND.',
                    'Use the second image strictly as CHARACTER/FOREGROUND.',
                    'Blend naturally with consistent lighting/shadows; keep the character pose, proportions, and style.',
                    'Remove backgrounds from the character cleanly and place the character harmoniously.',
                    prompt || '자연스럽게 합성해줘.'
                ].join('\n');

                const response = await fetch(`${API_BASE_URL}/api/gemini/image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: state.googleApiKey,
                    prompt: combinedPrompt,
                    images: [bgBase64, charBase64],
                    aspectRatio: aspectRatio,
                    model: GEMINI_MODELS.IMAGE
                })
            });

                if(!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const errMsg = errData.error || '';
                    const retryable = errMsg.includes('PROHIBITED_CONTENT') || errMsg.toLowerCase().includes('internal error');
                    if (retryable) {
                        setComposeStatus(`재시도(${attempt}) - ${errMsg || response.status}`);
                        continue;
                    }
                    throw new Error(errMsg || `합성 실패: ${response.status}`);
                }

                const data = await response.json();
                state.composeResults.push({
                    data: data.image,
                    filename: `compose_${i+1}_${Date.now()}.png`,
                    sourceName: character.name
                });
                renderComposeResults();
                success = true;
            } catch (error) {
                console.error(error);
                setComposeStatus(`오류 발생: ${error.message}. 재시도합니다...`);
                // 비재시도 에러는 중단
                if(!error.message.includes('PROHIBITED_CONTENT') && !error.message.toLowerCase().includes('internal error')) {
                    alert(`캐릭터 ${i+1} 처리 실패: ${error.message}`);
                    state.composeAbort = true;
                }
            }
        }
    }

    if(!state.composeAbort) setComposeStatus('완료되었습니다.');
    btn.disabled = false;
}

function setComposeStatus(text) {
    const el = document.getElementById('composeStatus');
    if(el) el.textContent = text || '';
}

function renderComposeResults() {
    const list = document.getElementById('composeResultList');
    if(!list) return;
    list.innerHTML = '';
    if(!state.composeResults.length) {
        list.innerHTML = '<div class="placeholder muted">합성 결과가 없습니다.</div>';
        return;
    }
    state.composeResults.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'compose-card';
        div.innerHTML = `
            <img src="data:image/png;base64,${item.data}" alt="compose-${idx+1}">
            <div class="info">
                <div>
                    <div class="label">${item.sourceName || '캐릭터'}</div>
                    <div>#${idx+1}</div>
                </div>
                <button class="btn-download">💾</button>
            </div>
        `;
        div.querySelector('.btn-download').addEventListener('click', () => downloadSingleComposite(item));
        list.appendChild(div);
    });
}

function downloadSingleComposite(item) {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${item.data}`;
    a.download = item.filename || 'compose.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function downloadAllComposites() {
    if(!state.composeResults.length) return alert('다운로드할 이미지가 없습니다.');
    try {
        if(window.JSZip) {
            const zip = new JSZip();
            state.composeResults.forEach((item, idx) => {
                zip.file(item.filename || `compose_${idx+1}.png`, item.data, { base64: true });
            });
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `compose_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            // fallback: 개별 다운로드 연속 실행
            state.composeResults.forEach(item => downloadSingleComposite(item));
        }
    } catch (error) {
        console.error('다운로드 실패', error);
        alert('다운로드 중 오류가 발생했습니다.');
    }
}

// ====== Chat ======
async function sendChatMessage() {
    if (!state.googleApiKey) return alert('Google API 키를 먼저 설정해주세요.');
    if (!state.activeChatRoomId) return alert('새 채팅 생성 버튼으로 채팅방을 먼저 만들어주세요.');
    const activeRoom = ensureActiveChatRoom();
    const inputEl = document.getElementById('chatPrompt');
    const text = inputEl.value.trim();
    if (!text && !state.attachedChatImage) return;

    addMessageToUI('user', text, state.attachedChatImage);
    inputEl.value = '';
    const currentImage = state.attachedChatImage; 
    clearImage('chat');

    const loadingId = addLoadingMessage();
    const selectedModel = state.chatModel || GEMINI_MODELS.CHAT_DEFAULT;
    const thinkingConfig = getThinkingConfigForModel(selectedModel);

    console.log('[Gemini Chat] request body', {
        model: selectedModel,
        thinkingConfig,
        hasImage: !!currentImage,
        imageLength: currentImage ? currentImage.length : 0,
        historyCount: state.chatHistory.length,
        messagePreview: text.slice(0, 120)
    });

    try {
        const response = await fetch(`${API_BASE_URL}/api/gemini/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: state.googleApiKey,
                message: text,
                image: currentImage ? currentImage.split(',')[1] : null, 
                history: state.chatHistory,
                model: selectedModel,
                thinkingConfig
            })
        });

        if (!response.ok) throw new Error('응답 오류');
        const data = await response.json();
        
        if (data.usageMetadata) logTokenUsage(data.usageMetadata, "채팅");

        removeMessage(loadingId);
        addMessageToUI('ai', data.reply);

        state.chatHistory.push({ role: 'user', parts: [{ text: text }] }); 
        state.chatHistory.push({ role: 'model', parts: [{ text: data.reply }] });
        if (activeRoom) {
            updateRoomTitle(activeRoom, text);
            activeRoom.history = [...state.chatHistory];
            activeRoom.updatedAt = Date.now();
            sortRoomsByUpdated();
            state.chatRoomPage = 0;
            saveChatRooms();
            renderChatRooms();
        }

    } catch (error) {
        removeMessage(loadingId);
        addMessageToUI('system', '오류가 발생했습니다: ' + error.message);
    }
}

// UI Utils (Chat)
function addMessageToUI(role, text, imageUrl = null, skipScroll = false) {
    const container = document.getElementById('chatHistory');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `message ${role}`;
    let content = '';
    if (imageUrl) content += `<img src="${imageUrl}" class="chat-image">`;
    if (text) content += `<div class="bubble">${text.replace(/\n/g, '<br>')}</div>`;
    div.innerHTML = content;
    container.appendChild(div);
    if (!skipScroll) container.scrollTop = container.scrollHeight;
}

function renderChatHistoryFromState() {
    const container = document.getElementById('chatHistory');
    if (!container) return;
    container.innerHTML = '';
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message system';
    systemDiv.innerHTML = `<div class="bubble" id="chatModelBadge">${escapeHtml(getChatModelLabel(state.chatModel))}</div>`;
    container.appendChild(systemDiv);
    if (!state.chatHistory || !state.chatHistory.length) return;
    state.chatHistory.forEach(entry => {
        const text = (entry.parts || []).map(p => p.text || '').join('\n');
        const role = entry.role === 'model' ? 'ai' : entry.role;
        addMessageToUI(role, text, null, true);
    });
    container.scrollTop = container.scrollHeight;
}

function addLoadingMessage() {
    const id = 'loading-' + Date.now();
    const container = document.getElementById('chatHistory');
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message ai';
    div.innerHTML = `<div class="bubble">...</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function logTokenUsage(metadata, type) {
    if(!metadata) return;
    tokenStats.totalRequests++;
    console.log(`[${type}] 토큰 사용량:`, metadata);
}

window.showTokenStats = function() {
    alert(`총 요청: ${tokenStats.totalRequests}회\n세부 내용은 콘솔(F12)을 확인하세요.`);
}
window.resetTokenStats = function() {
    tokenStats.totalRequests = 0;
    alert('초기화되었습니다.');
}

function escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch] || ch));
}
