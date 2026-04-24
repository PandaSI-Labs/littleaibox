let pdfMakeReady = false;

function ensurePdfMake() {
    if (pdfMakeReady) return;
    importScripts('/libs/pdfmake.min.js', '/libs/vfs_fonts.js');
    pdfMakeReady = true;
}

function normalizeBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

self.onmessage = (event) => {
    const data = event.data || {};
    if (data.type !== 'render') return;
    const { requestId, docDefinition, fonts, vfs, footerConfig } = data;
    try {
        ensurePdfMake();
        if (vfs) {
            pdfMake.vfs = { ...(pdfMake.vfs || {}), ...vfs };
        }
        if (fonts) {
            pdfMake.fonts = { ...(pdfMake.fonts || {}), ...fonts };
        }
        if (footerConfig) {
            docDefinition.footer = (currentPage) => ({
                text: `- ${currentPage} -`,
                alignment: footerConfig.alignment || 'center',
                fontSize: footerConfig.fontSize || 10.5,
                margin: footerConfig.margin || [0, 0, 0, 48]
            });
        }
        pdfMake.createPdf(docDefinition).getBuffer((buffer) => {
            const arrayBuffer = normalizeBuffer(buffer);
            self.postMessage({ type: 'result', requestId, buffer: arrayBuffer }, [arrayBuffer]);
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            requestId,
            message: error && error.message ? error.message : String(error)
        });
    }
};
