"use client";

import { useId, useRef, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

/** Portal outside the drawer's scrolling and animated clipping containers. */
export function CaptionSelect({ label, value, options, disabled, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  return <div className="classroom-v3-caption-select-field">
    <span id={labelId}>{label}</span>
    <Select.Root value={value} disabled={disabled} onValueChange={onChange} onOpenChange={open => {
      if (open) setContainer(trigger.current?.closest<HTMLElement>(".classroom-v3-shell") ?? undefined);
    }}>
      <Select.Trigger ref={trigger} className="classroom-v3-caption-select-trigger" aria-labelledby={labelId}>
        <Select.Value />
        <Select.Icon asChild><ChevronDown aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Content className="classroom-v3-caption-select-content" position="popper" align="end" sideOffset={6} collisionPadding={12}
          onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
          <Select.ScrollUpButton className="classroom-v3-caption-select-scroll"><ChevronUp aria-hidden="true" /></Select.ScrollUpButton>
          <Select.Viewport className="classroom-v3-caption-select-viewport">
            {options.map(option => <Select.Item key={option.value} value={option.value} className="classroom-v3-caption-select-option">
              <Select.ItemIndicator><Check aria-hidden="true" /></Select.ItemIndicator>
              <Select.ItemText>{option.label}</Select.ItemText>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className="classroom-v3-caption-select-scroll"><ChevronDown aria-hidden="true" /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}
