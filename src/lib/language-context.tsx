"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import en from "@/locales/en.json";
import ur from "@/locales/ur.json";

type Language = "en" | "ur";
type Translations = typeof en;

interface LanguageContextType {
  language: Language;
  direction: "ltr" | "rtl";
  t: Translations;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bloodbridge_lang") as Language | null;
      if (saved === "en" || saved === "ur") {
        return saved;
      }
    }
    return "en";
  });

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("bloodbridge_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  };

  const toggleLanguage = () => {
    const next = language === "en" ? "ur" : "en";
    setLanguage(next);
  };

  const t = language === "ur" ? (ur as unknown as Translations) : en;
  const direction = language === "ur" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider
      value={{
        language,
        direction,
        t,
        setLanguage,
        toggleLanguage,
      }}
    >
      <div dir={direction} className={`app-root ${direction === "rtl" ? "font-urdu" : "font-sans"}`}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
