"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            if (window.scrollY > 300) {
                setVisible(true);
            } else {
                setVisible(false);
            }
        };

        window.addEventListener("scroll", toggleVisibility, { passive: true });
        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    if (!visible) return null;

    return (
        <button
            onClick={scrollToTop}
            className="fixed bottom-20 md:bottom-8 right-6 z-40 p-2.5 rounded-full bg-card border border-border shadow-lg text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ backdropFilter: "blur(12px)" }}
            aria-label="Scroll to top"
            title="Scroll to top"
        >
            <ArrowUp className="w-5 h-5 text-primary" />
        </button>
    );
}
