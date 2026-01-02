const express = require('express');
const cors = require('cors');
const path = require('path');
const CHAT_MODEL_CONFIG = {
    'gemini-3-pro-preview': { label: 'Gemini 3 Pro' },
    'gemini-2.5-pro': { label: 'Gemini 2.5 Pro' }
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// [중요] 'public' 폴더의 파일을 웹사이트로 제공
app.use(express.static(path.join(__dirname, 'public')));

// 메인 페이지 접속 시
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gemini 페이지 접속 시
app.get('/gemini.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gemini.html'));
});

// ==========================================
// NovelAI 이미지 생성 프록시 (기존 유지)
// ==========================================
app.post('/api/novelai/generate-image', async (req, res) => {
    try {
        let bodyContent = req.body;
        if (typeof bodyContent === 'string') {
            bodyContent = JSON.parse(bodyContent);
        }

        const { apiKey, requestBody } = bodyContent;

        if (requestBody.parameters && 
            requestBody.parameters.director_reference_images && 
            requestBody.parameters.director_reference_images.length > 0) {
                
            requestBody.parameters.director_reference_images = 
                requestBody.parameters.director_reference_images.map(encodedStr => 
                    decodeURIComponent(encodedStr)
                );
        }

        const response = await fetch('https://image.novelai.net/ai/generate-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('!! NovelAI API 오류:', response.status, errorText);
            return res.status(response.status).json({
                error: errorText,
                status: response.status
            });
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.set('Content-Type', 'application/zip');
        res.send(buffer);
    } catch (error) {
        console.error('!! 프록시 서버 오류:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Gemini Chat 프록시 (옵션 적용됨)
// ==========================================
app.post('/api/gemini/chat', async (req, res) => {
    try {
        const { apiKey, message, image, history, model, thinkingConfig } = req.body;
        const targetModel = model || 'gemini-3-pro-preview'; 
        const modelConfig = CHAT_MODEL_CONFIG[targetModel] || CHAT_MODEL_CONFIG['gemini-3-pro-preview'];

        // base64는 찍지 않고 길이/유무만 로그
        console.log('[Gemini Chat] payload', { hasImage: !!image, imageLength: image ? image.length : 0, model: targetModel, historyCount: Array.isArray(history) ? history.length : 0, messagePreview: (message || '').slice(0, 180) });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

        const parts = [];
        if (image) {
            parts.push({
                inline_data: {
                    mime_type: "image/png",
                    data: image
                }
            });
        }
        parts.push({ text: message });

        const contents = history ? [...history] : [];
        contents.push({ role: 'user', parts: parts });

        const requestPayload = {
            contents: contents,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" }
            ],
            generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.95
            }
        };

        // thinkingConfig는 v1beta에서 필드 미지원 오류가 있어 항상 제외

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Gemini Error:', data);
            return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "(No response text)";
        
        res.json({ 
            reply: replyText,
            usageMetadata: data.usageMetadata 
        });

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Gemini Image 프록시 (나노바나나)
// ==========================================
// ==========================================
// Gemini Image 프록시 (나노바나나 - Gemini 3.0 Pro Image)
// ==========================================
// ==========================================
// Gemini Image 프록시 (수정됨: 디버깅 및 텍스트 응답 처리)
// ==========================================
// ==========================================
// Gemini Image 프록시 (로그 정리 버전)
// ==========================================
// ==========================================
// Gemini Image 프록시 (Gemini 3.0 Pro 호환 패치)
// ==========================================
// ==========================================
// Gemini Image 프록시 (디버깅 끝판왕 버전)
// ==========================================
app.post('/api/gemini/image', async (req, res) => {
    try {
        const { apiKey, prompt, image, images, model, aspectRatio, imageSize } = req.body;
        
        // 님이 원하시는 Gemini 3.0 모델
        const targetModel = 'gemini-3-pro-image-preview'; 

        console.log(`\n[Request Start] Model: ${targetModel}`);
        console.log(`- Prompt: ${prompt}`);
        const multiCount = Array.isArray(images) ? images.length : 0;
        console.log(`- Image Attached: ${!!image ? 'YES' : 'NO'} (len=${image ? image.length : 0})`);
        if (multiCount > 0) console.log(`- Multi Images: ${multiCount}개`);
        console.log(`- AspectRatio: default`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
        
        const parts = [];
        if (Array.isArray(images) && images.length) {
            images.forEach(img => parts.push({ inline_data: { mime_type: "image/png", data: img } }));
        } else if (image) {
            parts.push({ inline_data: { mime_type: "image/png", data: image } });
        }
        
        // [중요] 프롬프트가 너무 짧으면 AI가 헷갈려하니 내용을 보강합니다.
        // 사용자가 "리터칭"만 보내도, 영어로 구체적인 지시를 덧붙입니다.
        const refinedPrompt = prompt + "\n(Perform a high-quality image editing based on this instruction. Output the result as an IMAGE.)";
        parts.push({ text: refinedPrompt });

        const requestPayload = {
            contents: [{ parts: parts }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" }
            ]
        };

        if (aspectRatio || imageSize) {
            requestPayload.generationConfig.imageConfig = {
                ...(aspectRatio ? { aspectRatio } : {}),
                ...(imageSize ? { imageSize } : {})
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        const data = await response.json();

        // 1. 구글 서버 에러 체크
        if (!response.ok) {
            const errorStr = JSON.stringify(data, null, 2);
            console.error('!! Google API Error:', errorStr.substring(0, 500));
            return res.status(response.status).json({ error: data.error?.message || 'API 호출 에러' });
        }

        const candidate = data.candidates?.[0];
        
        // 2. 모델 중단 원인 체크
        if (candidate?.finishReason && candidate.finishReason !== "STOP") {
            console.warn(`!! 모델 중단됨 (이유: ${candidate.finishReason})`);
            return res.status(400).json({ error: `모델 생성 중단: ${candidate.finishReason}` });
        }

        const responseParts = candidate?.content?.parts;
        if (!responseParts || responseParts.length === 0) {
            console.error("!! 응답 내용 완전 없음 (Empty Parts)");
            return res.status(500).json({ error: "AI가 아무런 응답도 보내지 않았습니다." });
        }

        // 3. 이미지 탐색 (전체 파트 스캔)
        let targetImage = null;
        let textMessage = "";

        // Google 응답은 camelCase(`inlineData`)로 내려오므로 두 케이스 모두 허용
        for (const part of responseParts) {
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData && inlineData.data) {
                targetImage = inlineData.data;
            } else if (part.text) {
                textMessage += part.text + " ";
            } else {
                // 이미지가 아닌 이상한 데이터가 왔을 때 로그 찍기
                console.log("!! 알 수 없는 파트 발견:", JSON.stringify(part).substring(0, 200));
            }
        }

        if (targetImage) {
            console.log(`!! 이미지 발견 성공! (텍스트 메시지: ${textMessage.substring(0, 50)}...)`);
            return res.json({ 
                image: targetImage,
                usageMetadata: data.usageMetadata 
            });
        } else {
            // 이미지가 없으면 AI가 뭐라고 변명했는지 확인
            console.warn("!! 이미지가 없고 텍스트만 있음. 내용:", textMessage);
            
            // [디버깅용] 사용자가 로그를 보여줄 수 있도록 콘솔에 전체 구조 출력
            console.log(">> 전체 응답 구조:", JSON.stringify(data.candidates[0], null, 2));

            return res.status(400).json({ 
                error: `이미지 생성 실패. AI 응답: "${textMessage}"` 
            });
        }

    } catch (error) {
        console.error('Server Internal Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
