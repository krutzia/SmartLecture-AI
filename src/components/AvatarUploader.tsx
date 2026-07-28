import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { initialsOf } from "@/lib/profile";

const OUTPUT_SIZE = 256;
const VIEW = 260;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type Props = {
  value: string;
  name: string;
  onChange: (dataUrl: string) => void;
  size?: number;
};

export const AvatarUploader = ({ value, name, onChange, size = 80 }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.fillStyle = "#00000010";
    ctx.fillRect(0, 0, VIEW, VIEW);
    const base = Math.max(VIEW / img.width, VIEW / img.height);
    const scale = base * zoom;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (VIEW - w) / 2 + offset.x, (VIEW - h) / 2 + offset.y, w, h);
  }, [zoom, offset]);

  useEffect(() => { draw(); }, [draw, ready]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Image must be smaller than 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setSrc(url);
        setReady(true);
      };
      img.onerror = () => toast.error("Could not read that image.");
      img.src = url;
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsDataURL(file);
  };

  const startDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const onDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };
  const endDrag = () => { dragRef.current = null; };

  const save = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const k = OUTPUT_SIZE / VIEW;
    const base = Math.max(VIEW / img.width, VIEW / img.height);
    const scale = base * zoom * k;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, (OUTPUT_SIZE - w) / 2 + offset.x * k, (OUTPUT_SIZE - h) / 2 + offset.y * k, w, h);
    onChange(out.toDataURL("image/jpeg", 0.85));
    setSrc(null);
    setReady(false);
  };

  const initials = initialsOf(name);

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-full bg-gradient-hero font-display font-extrabold text-white"
        style={{ width: size, height: size, fontSize: size / 3 }}
      >
        {value ? (
          <img src={value} alt={name ? `${name}'s avatar` : "Profile avatar"} className="h-full w-full object-cover" />
        ) : (
          <span>{initials || <Camera className="h-5 w-5" />}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-3.5 w-3.5" /> {value ? "Change photo" : "Upload photo"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => onChange("")}>
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>

      <Dialog open={!!src} onOpenChange={(o) => { if (!o) { setSrc(null); setReady(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
            <DialogDescription>Drag to reposition and use the slider to zoom.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative" style={{ width: VIEW, height: VIEW }}>
              <canvas
                ref={canvasRef}
                width={VIEW}
                height={VIEW}
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="cursor-grab touch-none rounded-full active:cursor-grabbing"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/60" />
            </div>
            <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([z]) => setZoom(z)} className="w-full" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setSrc(null); setReady(false); }}>Cancel</Button>
            <Button type="button" onClick={save}>Save photo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
