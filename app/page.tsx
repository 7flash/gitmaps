/** @jsxImportSource tradjs/client */

/**
 * Canvas host only. The client renders files, menus and modals into these roots.
 * Never render a placeholder inside #canvasContent.
 */
export default function Page() {
  return (
    <>
      <div id="canvasViewport" className="canvas-viewport">
        <div id="canvasContent" className="canvas-content" />
      </div>
      <div id="canvasContextMenuPortal" />
      <div id="canvasModalPortal" />
      <div id="canvasToastPortal" />
    </>
  );
}
