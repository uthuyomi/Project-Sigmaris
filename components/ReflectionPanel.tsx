// components/ReflectionPanel.tsx
"use client";

interface ReflectionPanelProps {
  reflection: string;
}

export default function ReflectionPanel({ reflection }: ReflectionPanelProps) {
  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md whitespace-pre-wrap leading-relaxed text-gray-100">
      {reflection ? (
        <p>{reflection}</p>
      ) : (
        <p className="text-gray-500">まだ内省の記録はありません。</p>
      )}
    </div>
  );
}
