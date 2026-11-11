'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalDialogProps {
  open: boolean;
  /** 浏览器关闭弹窗时调用（Esc、返回手势、点背景）。由 open=false 触发的关闭不会再回调。 */
  onClose?: () => void;
  /** false：只能由代码关闭（如登录验证），Esc 与点背景都无效 */
  dismissible?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children: ReactNode;
}

// 点在弹窗矩形之外才算点背景：<dialog> 自身的内边距和子元素间隙也会是事件 target，不能用 target 判断
const isOutside = (event: PointerEvent, dialog: HTMLDialogElement) => {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom;
};

/**
 * 原生 <dialog> 模态：showModal() 自带顶层渲染、页面 inert、焦点限制、Esc/返回手势关闭和关闭后焦点归还。
 * 不要在外面再加 role="dialog"、aria-modal、焦点陷阱或 body overflow 锁。
 */
export default function ModalDialog({
  open,
  onClose,
  dismissible = true,
  className,
  style,
  children,
  ...aria
}: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React 的 autoFocus 不写 DOM 属性，showModal 看不到；用 data-autofocus 指定初始焦点
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      if (!dismissibleRef.current) event.preventDefault();
    };
    const handleClose = () => {
      if (!openRef.current) return; // 由 open=false 关闭，状态已同步
      if (!dismissibleRef.current) {
        // 连按 Esc 时浏览器可以无视 cancel 的 preventDefault，不可关闭的弹窗直接重新打开
        dialog.showModal();
        return;
      }
      onCloseRef.current?.();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    // closedby="any" 的兜底（Safari 尚不支持）：按下和松开都在弹窗外才算点背景，拖选文字到背景上不会误关
    let removeLightDismiss = () => {};
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const handlePointerDown = (event: PointerEvent) => { pressedOutside = isOutside(event, dialog); };
      const handlePointerUp = (event: PointerEvent) => {
        if (dismissibleRef.current && pressedOutside && isOutside(event, dialog)) dialog.close();
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', handlePointerDown);
      dialog.addEventListener('pointerup', handlePointerUp);
      removeLightDismiss = () => {
        dialog.removeEventListener('pointerdown', handlePointerDown);
        dialog.removeEventListener('pointerup', handlePointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
      removeLightDismiss();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={className ? `app-dialog ${className}` : 'app-dialog'}
      style={style}
      {...({ closedby: dismissible ? 'any' : 'none' } as Record<string, string>)}
      {...aria}
    >
      {open ? children : null}
    </dialog>
  );
}
