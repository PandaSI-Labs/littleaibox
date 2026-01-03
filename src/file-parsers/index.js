import { createDocxReader } from './docx.js';
import { createPdfReader } from './pdf.js';
import { createExcelReader } from './excel.js';
import { createPptxReader } from './pptx.js';

export function createFileParsers({ loadScript, mathRenderer, getToastMessage }) {
    const { readDocxFile } = createDocxReader({ loadScript, mathRenderer });
    const { readPdfFile } = createPdfReader({ loadScript, getToastMessage });
    const { readExcelFile } = createExcelReader({ loadScript, getToastMessage });
    const { readPptxFile } = createPptxReader({ loadScript, getToastMessage, mathRenderer });

    return {
        readDocxFile,
        readPdfFile,
        readExcelFile,
        readPptxFile
    };
}
