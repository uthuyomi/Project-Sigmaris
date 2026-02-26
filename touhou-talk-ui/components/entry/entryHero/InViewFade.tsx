"use client"

import { useEffect, useRef, useState } from "react";

export default function InViewFade({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
    }) { 
    const ref = useRef<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!ref.current) return;

        const observer = new IntersectionObserver(
          ([entry]) => {
            setVisible(entry.intersectionRatio >= 0.5);
          },
          {
            threshold: [0.5],
          },
        );

        observer.observe(ref.current);

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={`${className} transition-all duration-700 ease-out ${
                visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
        >
            {children}
        </div>
    );
}