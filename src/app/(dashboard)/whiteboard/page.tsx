"use client";

import dynamic from "next/dynamic";
import "tldraw/tldraw.css";
import { Component, type ErrorInfo, type ReactNode } from "react";

const Tldraw = dynamic(
    () => import("tldraw").then((mod) => mod.Tldraw),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
            </div>
        ),
    }
);

class WhiteboardErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean; errorMessage: string }
> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, errorMessage: "" };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, errorMessage: error.message };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Whiteboard error:", error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                    <p className="text-muted-foreground">Tahta yüklenemedi.</p>
                    <button
                        onClick={() => this.setState({ hasError: false, errorMessage: "" })}
                        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
                    >
                        Tekrar Dene
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function WhiteboardPage() {
    return (
        <div className="relative w-full" style={{ height: "calc(100vh - 3.5rem)" }}>
            <div className="absolute inset-0">
                <WhiteboardErrorBoundary>
                    <Tldraw persistenceKey="studyfield-whiteboard" />
                </WhiteboardErrorBoundary>
            </div>
        </div>
    );
}
