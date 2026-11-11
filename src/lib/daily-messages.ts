/**
 * Daily encouragement messages for the home screen.
 * These are original messages — not attributed to any real person.
 * Keys are indices; both English and Urdu variants are provided.
 */
export const dailyMessages: Array<{ en: string; ur: string }> = [
  {
    en: "One donation can save three lives. Your generosity today may be someone's miracle tomorrow.",
    ur: "ایک عطیہ تین زندگیاں بچا سکتا ہے۔ آج آپ کی سخاوت کسی کا معجزہ بن سکتی ہے۔",
  },
  {
    en: "Blood cannot be manufactured. Only people can give it. Thank you for being that person.",
    ur: "خون بنایا نہیں جا سکتا۔ صرف انسان ہی دے سکتا ہے۔ اس شخص ہونے کا شکریہ۔",
  },
  {
    en: "Availability costs nothing, but it means everything to someone waiting.",
    ur: "دستیابی میں کوئی قیمت نہیں، لیکن کسی منتظر کے لیے یہ سب کچھ ہے۔",
  },
  {
    en: "A community that donates together, heals together.",
    ur: "جو برادری مل کر عطیہ کرتی ہے، وہ مل کر شفا پاتی ہے۔",
  },
  {
    en: "Your blood type does not define you, but your willingness to share it does.",
    ur: "آپ کا بلڈ گروپ آپ کی پہچان نہیں، لیکن دینے کی خواہش ضرور ہے۔",
  },
  {
    en: "For thalassemia patients, every transfusion is a new beginning. Be the reason someone gets theirs.",
    ur: "تھیلیسیمیا کے مریضوں کے لیے ہر منتقلی ایک نئی شروعات ہے۔ کسی کی وجہ بنیں۔",
  },
  {
    en: "Emergencies do not wait. Neither should care.",
    ur: "ہنگامی حالات انتظار نہیں کرتے۔ فکر بھی نہ کرے۔",
  },
];

/**
 * Returns the message for today. Returns a default initial message during SSR/prerender
 * and deterministically calculates based on the client date in useEffect or event handler.
 */
export function getTodaysMessage(): { en: string; ur: string } {
  return dailyMessages[0];
}

export function getClientDailyMessage(): { en: string; ur: string } {
  if (typeof window === "undefined") {
    return dailyMessages[0];
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = Number(now) - Number(start);
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return dailyMessages[dayOfYear % dailyMessages.length];
}

