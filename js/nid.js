/* الرقم القومي المصري — structure check.
   Layout (14 digits):  C YYMMDD GG SSSS K
     C    century: 2 = 1900s, 3 = 2000s
     YYMMDD birth date
     GG   governorate code
     SSSS serial (the 13th digit is odd for males, even for females)
     K    check digit — NOT verified: the algorithm is not officially published,
          and a wrong guess would reject real IDs.
   Exposes window.NID.parse(str) → {ok, error?, birthDate?, governorate?}. */
(function () {
  "use strict";

  // Verify against an official source before each release.
  const GOVERNORATES = {
    "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
    "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية",
    "15": "كفر الشيخ", "16": "الغربية", "17": "المنوفية", "18": "البحيرة",
    "19": "الإسماعيلية", "21": "الجيزة", "22": "بني سويف", "23": "الفيوم",
    "24": "المنيا", "25": "أسيوط", "26": "سوهاج", "27": "قنا",
    "28": "أسوان", "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد",
    "33": "مطروح", "34": "شمال سيناء", "35": "جنوب سيناء", "88": "خارج الجمهورية",
  };

  const MIN_AGE = 14, MAX_AGE = 80;

  function toLatin(s) {
    return String(s)
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  }

  /** Strips spaces/dashes and converts Arabic-Indic digits. */
  function normalize(s) {
    return toLatin(s).replace(/[\s\-_.]/g, "");
  }

  function parse(input, now = new Date()) {
    const s = normalize(input);
    if (!/^\d+$/.test(s)) return { ok: false, error: "الرقم القومي يتكون من أرقام فقط." };
    if (s.length !== 14) return { ok: false, error: "الرقم القومي ١٤ رقمًا." };

    const century = s[0] === "2" ? 1900 : s[0] === "3" ? 2000 : 0;
    if (!century) return { ok: false, error: "الرقم القومي يبدأ بـ ٢ أو ٣." };

    const year = century + Number(s.slice(1, 3));
    const month = Number(s.slice(3, 5));
    const day = Number(s.slice(5, 7));
    const birth = new Date(Date.UTC(year, month - 1, day));
    const realDate =
      month >= 1 && month <= 12 &&
      birth.getUTCFullYear() === year &&
      birth.getUTCMonth() === month - 1 &&
      birth.getUTCDate() === day;
    if (!realDate) return { ok: false, error: "تاريخ الميلاد داخل الرقم القومي غير صحيح. راجع الأرقام من ٢ إلى ٧." };
    if (birth > now) return { ok: false, error: "تاريخ الميلاد داخل الرقم القومي في المستقبل. راجع الرقم." };

    const age = (now - birth) / (365.2425 * 24 * 3600 * 1000);
    if (age < MIN_AGE || age > MAX_AGE) {
      return { ok: false, error: "تاريخ الميلاد داخل الرقم القومي لا يناسب طالبًا جامعيًا. راجع الرقم." };
    }

    const gov = GOVERNORATES[s.slice(7, 9)];
    if (!gov) return { ok: false, error: "كود المحافظة داخل الرقم القومي غير معروف (الرقمان ٨ و٩)." };

    return { ok: true, id: s, birthDate: birth, governorate: gov };
  }

  /** Masks all but the last 4 digits. */
  function mask(id) {
    const s = String(id);
    // A space keeps the dots apart from the digits (Arabic zero "٠" is also a dot).
    return "•".repeat(Math.max(0, s.length - 4)) + " " + s.slice(-4);
  }

  window.NID = { parse, normalize, mask, toLatin, GOVERNORATES };
})();
