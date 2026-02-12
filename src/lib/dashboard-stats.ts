export interface DailyActivityPoint {
    dateKey: string;
    label: string;
    notes: number;
    videos: number;
    pdfNotes: number;
    total: number;
}

export function parseDurationToSeconds(duration: string): number {
    if (!duration) return 0;

    const parts = duration.split(":").map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) return 0;

    if (parts.length === 3) {
        const [hours, minutes, seconds] = parts;
        return hours * 3600 + minutes * 60 + seconds;
    }

    if (parts.length === 2) {
        const [minutes, seconds] = parts;
        return minutes * 60 + seconds;
    }

    if (parts.length === 1) {
        return parts[0];
    }

    return 0;
}

export function getWeekStart(baseDate = new Date()): Date {
    const weekStart = new Date(baseDate);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1;

    weekStart.setDate(weekStart.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

export function formatHourValue(totalSeconds: number): string {
    const totalHours = totalSeconds / 3600;

    if (totalHours <= 0) {
        return "0";
    }

    if (totalHours < 10) {
        const fractionalDigits = totalHours % 1 === 0 ? 0 : 1;
        return totalHours.toLocaleString("tr-TR", {
            minimumFractionDigits: fractionalDigits,
            maximumFractionDigits: 1,
        });
    }

    return Math.round(totalHours).toLocaleString("tr-TR");
}

export function formatClockValue(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toDateKey(input: string | Date): string {
    const date = input instanceof Date ? new Date(input) : new Date(input);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function createLastSevenDays(baseDate = new Date()): DailyActivityPoint[] {
    const today = new Date(baseDate);
    today.setHours(0, 0, 0, 0);

    const points: DailyActivityPoint[] = [];

    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        points.push({
            dateKey: toDateKey(date),
            label: date.toLocaleDateString("tr-TR", { weekday: "short" }),
            notes: 0,
            videos: 0,
            pdfNotes: 0,
            total: 0,
        });
    }

    return points;
}

export function dateKey(input: string): string {
    return toDateKey(input);
}
