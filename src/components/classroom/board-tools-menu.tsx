"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, MousePointer2, Type, Eraser, Undo2, Redo2, Trash2, RectangleHorizontal, Circle, X, Minus, ArrowUpRight, Hand, ScanLine, Delete } from "lucide-react";
import { ClassroomIconButton } from "./icon-button";
import type { ClassroomWhiteboardController, ClassroomWhiteboardTool } from "./fastboard-surface";
import { useTranslation } from "@/lib/i18n/context";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function BoardToolsMenu({ controller, tool, onTool, onOpen, screenAnnotation = false }: { controller: ClassroomWhiteboardController | null; tool: ClassroomWhiteboardTool; onTool: (tool: ClassroomWhiteboardTool) => void; onOpen: () => void; screenAnnotation?: boolean }) {
  const { t } = useTranslation(), root = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [clear, setClear] = useState(false), [color, setColor] = useState("79,70,229"), [width, setWidth] = useState(4), [eraserSize, setEraserSize] = useState<1 | 2 | 3 | 4>(2), [textSize, setTextSize] = useState(24);
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const attachRoot = useCallback((node: HTMLSpanElement | null) => {
    root.current = node;
    if (node) setPortalHost(node.closest(".classroom-v3-shell"));
  }, []);
  useEffect(() => { const show = () => { onOpen(); setOpen(true); }; window.addEventListener("classroom-open-board-tools", show); return () => window.removeEventListener("classroom-open-board-tools", show); }, [onOpen]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  const tools = [
    ['selector', MousePointer2, 'classroom.v3.boardSelect', 'V'], ['clicker', Hand, 'classroom.v3.boardMove', 'H'],
    ['pencil', Pencil, 'classroom.v3.boardPencil', 'P'], ['straight', Minus, 'classroomDrawing.line', 'L'], ['arrow', ArrowUpRight, 'classroomDrawing.arrow', 'A'],
    ['rectangle', RectangleHorizontal, 'classroom.v3.boardRectangle', 'R'], ['ellipse', Circle, 'classroom.v3.boardEllipse', 'O'],
    ['text', Type, 'classroom.v3.boardText', 'T'], ['eraser', Eraser, 'classroom.v3.boardEraser', 'E'], ['laserPointer', ScanLine, 'classroom.v3.boardLaser', 'K'],
  ] as const;
  return <span className="classroom-board-tools-anchor" ref={attachRoot}>
    <ClassroomIconButton type="button" className="classroom-board-tools-trigger" title={t('classroomMinimal.tools')} aria-label={t('classroomMinimal.tools')} aria-expanded={open} onClick={() => { if (!open) onOpen(); setOpen(!open); }}><Pencil /></ClassroomIconButton>
    {open && portalHost && createPortal(<div ref={popup} className="classroom-board-tools-menu" role="dialog" aria-label={t('classroomMinimal.tools')}>
      <header className="classroom-board-tools-header"><span>{t('classroomMinimal.tools')}</span><ClassroomIconButton type="button" title={t('classroom.v3.collapsePanel')} aria-label={t('classroom.v3.collapsePanel')} onClick={() => setOpen(false)}><X /></ClassroomIconButton></header>
      <div className="classroom-board-tools-grid" role="group" aria-label={t('classroomMinimal.tools')}>{tools.filter(([value]) => !screenAnnotation || value !== 'clicker').map(([value, Icon, label, key]) => <ClassroomIconButton key={value} type="button" disabled={!controller} title={`${t(label)} · ${key}${value === 'pencil' ? ` · ${t('classroomDrawing.shiftLine')}` : ''}`} aria-label={t(label)} aria-pressed={tool === value} onClick={() => { onTool(value); controller?.setTool(value); }}><Icon /></ClassroomIconButton>)}</div>
      {tool === 'eraser' ? <div className="classroom-board-eraser-sizes" role="group" aria-label={t('classroom.v3.eraserSettings')}>{([1, 2, 3, 4] as const).map(size => <ClassroomIconButton key={size} type="button" disabled={!controller} aria-pressed={eraserSize === size} aria-label={t(`classroom.v3.eraserSize${['', 'Small', 'Medium', 'Large', 'ExtraLarge'][size]}`)} title={t(`classroom.v3.eraserSize${['', 'Small', 'Medium', 'Large', 'ExtraLarge'][size]}`)} onClick={() => { setEraserSize(size); controller?.setEraserSize(size); }}><i style={{ width: 7 + size * 4, height: 7 + size * 4 }} /></ClassroomIconButton>)}</div> : <div className="classroom-board-colors" role="group" aria-label={t('classroomMinimal.color')}>{[['79,70,229', 'indigo'], ['32,36,43', 'black'], ['192,53,69', 'red'], ['23,131,88', 'green']].map(([value, label]) => <ClassroomIconButton type="button" key={value} disabled={!controller} style={{ background: `rgb(${value})` }} aria-label={t(`classroomMinimal.${label}`)} title={t(`classroomMinimal.${label}`)} aria-pressed={color === value} onClick={() => { setColor(value); controller?.setStrokeColor(value.split(',').map(Number) as [number, number, number]); }} />)}<label><span className="sr-only">{t(tool === 'text' ? 'classroomDrawing.textSize' : 'classroomMinimal.stroke')}</span><input type="range" min={tool === 'text' ? 12 : 1} max={tool === 'text' ? 60 : 12} value={tool === 'text' ? textSize : width} disabled={!controller} aria-label={t(tool === 'text' ? 'classroomDrawing.textSize' : 'classroomMinimal.stroke')} onChange={event => { const next = Number(event.target.value); if (tool === 'text') { setTextSize(next); controller?.setTextSize(next); } else { setWidth(next); controller?.setStrokeWidth(next); } }} /></label></div>}
      <div className="classroom-board-tools-top">
        <ClassroomIconButton type="button" disabled={!controller} aria-label={t('classroomMinimal.undo')} title={`${t('classroomMinimal.undo')} · Ctrl/⌘ Z`} onClick={() => controller?.undo()}><Undo2 /></ClassroomIconButton>
        <ClassroomIconButton type="button" disabled={!controller} aria-label={t('classroomMinimal.redo')} title={`${t('classroomMinimal.redo')} · Ctrl/⌘ Y`} onClick={() => controller?.redo()}><Redo2 /></ClassroomIconButton>
        <ClassroomIconButton type="button" disabled={!controller?.deleteSelection} aria-label={t('classroomDrawing.deleteSelected')} title={`${t('classroomDrawing.deleteSelected')} · Delete`} onClick={() => controller?.deleteSelection?.()}><Delete /></ClassroomIconButton>
        <ClassroomIconButton type="button" disabled={!controller} aria-label={t('classroom.v3.clearBoardConfirm')} title={t('classroom.v3.clearBoardConfirm')} onClick={() => setClear(true)}><Trash2 /></ClassroomIconButton>
      </div>
    </div>, portalHost)}
    <Dialog open={clear} onOpenChange={setClear}><DialogContent><DialogTitle>{t('classroom.v3.clearBoardConfirm')}</DialogTitle><DialogDescription>{t('classroomMinimal.clearHint')}</DialogDescription><div className="classroom-minimal-confirm"><ClassroomIconButton type="button" onClick={() => setClear(false)}>{t('common.cancel')}</ClassroomIconButton><ClassroomIconButton type="button" onClick={() => { controller?.clear(); setClear(false); }}>{t('common.confirm')}</ClassroomIconButton></div></DialogContent></Dialog>
  </span>;
}
