"use client";

import dynamic from "next/dynamic";
import "tldraw/tldraw.css";

const Tldraw = dynamic(
    () => import("tldraw").then((mod) => mod.Tldraw),
    { ssr: false }
);

export default function WhiteboardPage() {
    return (
        <div className="relative w-full" style={{ height: "calc(100vh - 3.5rem)" }}>
            <div className="absolute inset-0">
                <Tldraw persistenceKey="studyfield-whiteboard" />
            </div>
        </div>
    );
}
