"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

function SignaturePad({
  onSigned,
  onCleared,
}: {
  onSigned: (data: string) => void;
  onCleared: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasStrokes = useRef(false);
  const initialised = useRef(false);

  function ensureInit() {
    if (initialised.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = "#044e77";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    initialised.current = true;
  }

  function getXY(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function handleStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    ensureInit();
    isDrawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getXY(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getXY(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokes.current = true;
  }

  function handleEnd(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawing.current = false;
    if (hasStrokes.current) {
      onSigned(canvasRef.current!.toDataURL("image/png"));
    }
  }

  function handleClear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
    onCleared();
  }

  return (
    <div>
      <div className="border-2 border-dashed border-[#ddd8d2] rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 120, display: "block" }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="mt-1.5 text-xs text-[#9a8f87] hover:text-[#044e77] transition-colors"
      >
        Clear
      </button>
    </div>
  );
}

export default function IntakeAcknowledge({ formId }: { formId: string }) {
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAcknowledge() {
    if (!signature) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intake/${formId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultantSignature: signature }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to save. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-6 mb-6">
      <h3 className="font-[family-name:var(--font-cormorant)] italic text-lg text-[#044e77] mb-1">
        Consultant Sign-off
      </h3>
      <p className="text-xs text-[#9a8f87] mb-5">
        Sign below to acknowledge that you have reviewed this client&apos;s intake form.
      </p>

      <SignaturePad
        onSigned={setSignature}
        onCleared={() => setSignature(null)}
      />

      {error && (
        <div className="mt-3 text-sm text-red-600">{error}</div>
      )}

      <button
        type="button"
        onClick={handleAcknowledge}
        disabled={!signature || saving}
        className="mt-5 w-full bg-[#044e77] text-white text-sm font-medium py-3 rounded-xl
                   hover:bg-[#033d5e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Acknowledge & Sign"}
      </button>
    </div>
  );
}
