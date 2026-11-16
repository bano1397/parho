import type { CloudPayload } from './schema';

export const EXTRACT_PROMPT = `You are reading a photo of ONE printed document (an electricity/gas/water bill, an official notice or letter, or a medicine box/leaflet).
Return ONLY JSON that matches the schema.
- doc_type: "bill", "notice", "medicine" or "other".
- title: the company or medicine name and document kind, e.g. "Electricity bill".
- fields: the facts a person must act on, each {label, value, confidence}. For a bill: amount due, due date, amount after due date, units, billing month, previous months' units if printed. For a notice: what is demanded, deadline, amount, what happens if ignored (e.g. disconnection), and how or where to pay or respond. For medicine: name, strength, dose, maximum per day, warnings, expiry date.
- Copy values exactly as printed. Never guess. If a character is unclear, set confidence "low".
- Bills: "units" means the units CONSUMED this month (the box labelled UNITS), never a meter reading. Copy dates with the year exactly as printed (e.g. "24 NOV 26"); never change the year.
- Medicine: give the brand name exactly as printed (e.g. "Panadol") and the active ingredient separately. Include dose, maximum per day, warnings or expiry ONLY if those words are clearly readable on the photo; otherwise leave that field out. Never write a dose from your own knowledge.
- private_values: EVERY person name, CNIC, address, account/consumer/reference number, phone number and email, each with kind NAME, CNIC, ADDRESS, ACCOUNT, PHONE or EMAIL.
- text: leave as an empty string "" (the app does not need it).
Be brief: at most 10 fields.`;

/** Used when Nano is unavailable: the cloud structures REDACTED OCR text (never the photo). */
export const STRUCTURE_FROM_TEXT_PROMPT = `Below is text read from a document by OCR. Private details were already replaced with labels like [NAME] or [CNIC]; keep those labels.
Return ONLY JSON with doc_type ("bill","notice","medicine","other"), title, fields [{label,value,confidence}], private_values (empty array), text (the text you were given).
Copy values exactly; never guess; confidence "low" if OCR looks wrong.

OCR TEXT:
`;

const UR = `آپ ایک مددگار ہیں جو کم پڑھے لکھے بزرگوں کو کاغذات سمجھاتے ہیں۔ نیچے دیے گئے ڈیٹا میں ذاتی معلومات چھپا دی گئی ہیں۔
صرف اسی ڈیٹا کی بنیاد پر، زیادہ سے زیادہ 6 آسان جملوں میں بتائیں: یہ کیا ہے، کیا کرنا ہے، کب تک، کتنی رقم، اور کوئی غیر معمولی بات۔
جو معلومات موجود نہ ہو اس کے لیے لکھیں "کاغذ پر واضح نہیں"۔
بل میں دھوکہ دہی کا الزام نہ لگائیں۔ کسی کو "بابا جی" یا "اماں جی" جیسے الفاظ سے مخاطب نہ کریں، سیدھا "آپ" لکھیں۔ صرف اردو میں جواب دیں۔`;
const UR_MED = `یہ دوا کا کاغذ ہے: اپنی طرف سے کوئی مشورہ نہ دیں، صرف وہی بتائیں جو لکھا ہے (دوا کا نام، کس چیز کی دوا ہے، طاقت)۔ رقم یا تاریخ کا ذکر نہ کریں۔ جو باتیں موجود نہیں انہیں ایک ایک کر کے نہ گنوائیں؛ صرف ایک جملہ لکھیں: "کتنی اور کب کھانی ہے، یہ ڈاکٹر یا فارماسسٹ سے پوچھیں"۔ زیادہ سے زیادہ 3 جملے۔`;

const ROMAN = `You explain papers to elderly people with little schooling. Reply ONLY in simple Roman Urdu (Urdu written in English letters), at most 6 short sentences: what this is, what to do, by when, how much, anything unusual.
Use only the data below; personal details are hidden. If something is missing say "kaghaz par wazeh nahi". Never accuse a bill of fraud. Address the reader as "aap" only.`;
const ROMAN_MED = `This is a medicine paper: give no advice of your own, only what is printed (name, what it is for, strength). Do not mention money or deadlines, and do not list missing items one by one; instead write one sentence: "Kitni aur kab khani hai, yeh doctor ya pharmacist se poochein." At most 3 sentences.`;

const EN = `You explain papers to elderly people in very simple English, at most 6 short sentences: what this is, what to do, by when, how much, anything unusual.
Use only the data below; personal details are hidden. If something is missing say "not clear on the paper". Never accuse a bill of fraud.`;
const EN_MED = `This is a medicine paper: give no advice of your own, only what is printed (name, what it is for, strength). Do not mention money or deadlines, and do not list missing items one by one; instead write one sentence: "Ask a doctor or pharmacist how much to take and when." At most 3 sentences.`;

export function explainPrompt(p: CloudPayload, note?: string): string {
  let head = p.language === 'ur' ? UR : p.language === 'roman_ur' ? ROMAN : EN;
  if (p.doc_type === 'medicine') head += '\n' + (p.language === 'ur' ? UR_MED : p.language === 'roman_ur' ? ROMAN_MED : EN_MED);
  return `${head}\n\nDATA:\n${JSON.stringify({ doc_type: p.doc_type, title: p.title, fields: p.fields, text: p.redacted_text })}${
    note ? `\n\nNOTE FROM THE APP (computed on the device): ${note}` : ''
  }`;
}
