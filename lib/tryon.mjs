/**
 * Virtual Try-On — B Accessories v2.4
 *
 * يدعم كلاً من:
 * 1. Google Gemini API (`TRYON_PROVIDER=gemini`) — باستخدام GEMINI_API_KEY
 * 2. Google Cloud Vertex AI (`TRYON_PROVIDER=vertexai`) — باستخدام GOOGLE_PROJECT_ID و GOOGLE_ACCESS_TOKEN
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const VERTEX_TRYON_MODEL = 'virtual-try-on-001';

export class TryOnError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = 'TryOnError';
  }
}

function detectMime(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

function toDataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new TryOnError('فشل تحميل صورة المنتج من السيرفر', 502);
  return Buffer.from(await res.arrayBuffer());
}

// ── 1. مزود Gemini API ────────────────────────────────────────────────────────
async function callGemini(apiKey, personBase64, personMime, productBase64, productMime, category) {
  // النماذج المتاحة فعلياً على حسابك لتوليد الصور ومعالجة الرؤية
  const modelsToTry = [
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image',
    'gemini-3.8-flash'
  ];

  const prompt = `You are an expert fashion stylist. Place this jewelry/accessory item onto the person naturally and realistically. 
Keep the person's face, features, body shape, and lighting consistent. The accessory category is ${category}. 
Ensure the accessory fits accurately with high detail and realistic perspective and shadows. Output the final high-quality photo.`;

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: personMime, data: personBase64 } },
              { inline_data: { mime_type: productMime, data: productBase64 } }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT']
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        if (data?.error?.status === 'PERMISSION_DENIED') {
          throw new TryOnError(
            'برجاء تفعيل الـ API من Google Console بالضغط على الرابط: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=1071865019168 ثم الضغط على Enable',
            403
          );
        }
        lastError = msg;
        continue;
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inline_data?.data) {
          const buf = Buffer.from(part.inline_data.data, 'base64');
          return {
            buffer: buf,
            mime: part.inline_data.mime_type || 'image/jpeg'
          };
        }
      }
    } catch (err) {
      if (err instanceof TryOnError) throw err;
      lastError = err.message;
    }
  }

  throw new TryOnError(
    lastError ? `خطأ أثناء معالجة الصورة بـ Gemini: ${lastError}` : 'لم يرجع نموذج الذكاء الاصطناعي صورة، جربي صورة شخصية أكثر وضوحاً',
    502
  );
}

// ── 2. مزود Google Cloud Vertex AI (virtual-try-on-001) ──────────────────────
async function callVertexTryOn(projectId, location, accessToken, personBase64, productBase64) {
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${VERTEX_TRYON_MODEL}:predict`;

  const body = JSON.stringify({
    instances: [
      {
        personImage: {
          image: { bytesBase64Encoded: personBase64 }
        },
        productImages: [
          {
            image: { bytesBase64Encoded: productBase64 }
          }
        ]
      }
    ],
    parameters: {
      imageCount: 1
    }
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    if (res.status === 401) {
      throw new TryOnError('انتهت صلاحية الـ Access Token — يرجى تجديده في ملف .env', 401);
    }
    if (res.status === 403) {
      throw new TryOnError('برجاء تفعيل Vertex AI API في مشروع Google Cloud Console', 403);
    }
    throw new TryOnError(`خطأ من Vertex AI: ${res.status} — ${msg}`, 502);
  }

  const predictions = data?.predictions;
  if (!predictions?.length) {
    throw new TryOnError('لم يرجع نموذج التجربة صورة — جربي مرة أخرى', 502);
  }

  const imgBase64 = predictions[0]?.image?.bytesBase64Encoded || predictions[0]?.bytesBase64Encoded || predictions[0];
  if (!imgBase64 || typeof imgBase64 !== 'string') {
    throw new TryOnError('صيغة رد غير متوقعة من نموذج التجربة', 502);
  }

  const buffer = Buffer.from(imgBase64, 'base64');
  const mime = detectMime(buffer) || 'image/jpeg';
  return { buffer, mime };
}

// ── الدالة الرئيسية الموحدة ──────────────────────────────────────────────────
export async function tryOnProduct(env, db, input) {
  const provider = (env.TRYON_PROVIDER || 'gemini').toLowerCase();

  // التحقق من المتطلبات حسب المزود
  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) {
      throw new TryOnError('مفتاح GEMINI_API_KEY غير موجود في ملف .env', 503);
    }
  } else if (provider === 'vertexai') {
    if (!env.GOOGLE_PROJECT_ID || !env.GOOGLE_ACCESS_TOKEN) {
      throw new TryOnError('بيانات GOOGLE_PROJECT_ID و GOOGLE_ACCESS_TOKEN غير مكتملة في ملف .env', 503);
    }
  } else {
    throw new TryOnError(`المزود "${provider}" غير مدعوم، استخدمي gemini أو vertexai`, 503);
  }

  // التحقق من صورة العميلة
  if (!input.image_base64 || typeof input.image_base64 !== 'string') {
    throw new TryOnError('الصورة مطلوبة');
  }
  const personBase64 = input.image_base64.replace(/^data:image\/[a-z+]+;base64,/, '');
  const personBuffer = Buffer.from(personBase64, 'base64');

  if (personBuffer.length < 5000) throw new TryOnError('الصورة صغيرة جداً أو غير صالحة');
  if (personBuffer.length > 8_000_000) throw new TryOnError('الصورة كبيرة — الحد الأقصى 8 ميجابايت');

  const personMime = detectMime(personBuffer);
  if (!personMime) throw new TryOnError('نوع الصورة غير مدعوم — ارفعي JPG أو PNG أو WebP');

  // جلب صورة المنتج من قاعدة البيانات
  if (!input.product_id || typeof input.product_id !== 'string') {
    throw new TryOnError('معرف المنتج مطلوب');
  }

  const rows = await db.query(
    'SELECT images FROM products WHERE id=? AND active=1',
    [input.product_id.trim().slice(0, 64)]
  );
  if (!rows.length) throw new TryOnError('المنتج غير موجود في المتجر', 404);

  const images = JSON.parse(rows[0].images);
  if (!images.length) throw new TryOnError('المنتج ليس له صورة مسجلة', 422);

  const firstImage = images[0];
  const origin = env.PUBLIC_ORIGIN || 'http://127.0.0.1:4180';
  const productUrl = firstImage.startsWith('http') ? firstImage : origin + firstImage;

  const productBuffer = await fetchImageBuffer(productUrl);
  const productMime = detectMime(productBuffer) || 'image/jpeg';
  const productBase64 = productBuffer.toString('base64');

  let result;
  if (provider === 'gemini') {
    result = await callGemini(
      env.GEMINI_API_KEY,
      personBase64,
      personMime,
      productBase64,
      productMime,
      input.category || 'accessories'
    );
  } else {
    result = await callVertexTryOn(
      env.GOOGLE_PROJECT_ID,
      env.GOOGLE_LOCATION || 'us-central1',
      env.GOOGLE_ACCESS_TOKEN,
      personBase64,
      productBase64
    );
  }

  return {
    result_url: toDataUrl(result.buffer, result.mime),
    prediction_id: `${provider}-${Date.now()}`,
  };
}

export function isTryOnEnabled(env) {
  const provider = (env.TRYON_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'gemini') return !!env.GEMINI_API_KEY;
  if (provider === 'vertexai') return !!(env.GOOGLE_PROJECT_ID && env.GOOGLE_ACCESS_TOKEN);
  return false;
}
