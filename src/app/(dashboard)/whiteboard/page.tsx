"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export default function WhiteboardPage() {
    return (
        <div className="relative w-full" style={{ height: "calc(100vh - 3.5rem)" }}>
            <div className="absolute inset-0">
                <Tldraw persistenceKey="studyfield-whiteboard" />
            </div>
        </div>
    );
}
