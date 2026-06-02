/** @jsxImportSource tradjs/client */

import { CanvasApplication } from './lib/canvas/app';

let activeApplication: CanvasApplication | null = null;

export default function mount(): () => void {
  activeApplication?.dispose();

  const application = new CanvasApplication();
  activeApplication = application;
  application.mount();

  return () => {
    if (activeApplication === application) activeApplication = null;
    application.dispose();
  };
}
