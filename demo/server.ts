import path from 'path';
import { serve } from 'tradjs';

const appDir = path.join(import.meta.dir, 'app');

serve(appDir, {
    port: 3339,
});