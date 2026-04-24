import { readFileHeader, isZipHeader } from './media-utils.js';

export function createExcelReader({ loadScript, getToastMessage }) {

    const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
    const DEFAULT_PARSE_TIMEOUT_MS = 8000;

    const runWithTimeout = async (promise, timeoutMs, timeoutMessage) => {
        if (!timeoutMs || timeoutMs <= 0) return promise;
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const guardExcelFile = async (file) => {
        if (!file) return;
        if (file.size && file.size > DEFAULT_MAX_FILE_BYTES) {
            throw new Error(getToastMessage('fileManagement.fileTooLarge') || 'File too large.');
        }
        const extension = file?.name?.split('.').pop()?.toLowerCase() || '';
        if (extension === 'xlsx' || extension === 'xlsm' || extension === 'xltx' || extension === 'xltm') {
            const header = await readFileHeader(file, 4);
            if (!isZipHeader(header)) {
                throw new Error(getToastMessage('fileManagement.invalidFileType') || 'Invalid file type.');
            }
        }
    };

    const readExcelFile = async (file) => {
        await loadScript('/libs/xlsx.full.min.js', 'XLSX');

        await guardExcelFile(file);

        return await runWithTimeout(new Promise((resolve, reject) => {
            const maxColumns = 100;
            const extension = file?.name?.split('.').pop()?.toLowerCase();

            const convertWorkbookToMarkdown = (workbook) => {
                let allMarkdown = '';
                workbook.SheetNames.forEach(sheetName => {
                    allMarkdown += `\n\n## ${getToastMessage('fileProcessing.worksheet')}: ${sheetName}\n\n`;
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (json.length > 0 && json[0].length > 0) {
                        const columnCount = Math.min(json[0].length, maxColumns);
                        const headerRow = json[0]
                            .slice(0, columnCount)
                            .map(cell => (cell === null || cell === undefined ? '' : String(cell).replace(/\n/g, '<br>')));
                        allMarkdown += `| ${headerRow.join(' | ')} |\n`;
                        allMarkdown += `| ${new Array(columnCount).fill('---').join(' | ')} |\n`;
                        json.slice(1).forEach(row => {
                            const newRow = row.map(cell => {
                                if (cell === null || cell === undefined) return '';
                                return String(cell).replace(/\n/g, '<br>');
                            });
                            while (newRow.length < columnCount) {
                                newRow.push('');
                            }
                            allMarkdown += `| ${newRow.slice(0, columnCount).join(' | ')} |\n`;
                        });
                    }
                });
                return allMarkdown;
            };

            const reader = new FileReader();

            reader.onload = function (event) {
                const data = new Uint8Array(event.target.result);

                const detectEncodingFromBom = (bytes) => {
                    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
                        return 'utf-8';
                    }
                    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
                        return 'utf-16le';
                    }
                    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
                        return 'utf-16be';
                    }
                    return null;
                };

                const estimateNullRatio = (bytes) => {
                    if (!bytes.length) return 0;
                    let nullCount = 0;
                    for (let i = 0; i < bytes.length; i += 1) {
                        if (bytes[i] === 0) nullCount += 1;
                    }
                    return nullCount / bytes.length;
                };

                const estimateReplacementRatio = (text) => {
                    if (!text) return 1;
                    let replacements = 0;
                    for (let i = 0; i < text.length; i += 1) {
                        if (text[i] === '\uFFFD') replacements += 1;
                    }
                    return replacements / text.length;
                };

                const decodeText = (encoding) => {
                    try {
                        return new TextDecoder(encoding).decode(data);
                    } catch (_) {
                        return null;
                    }
                };

                const decodeWithStrategy = () => {
                    const bomEncoding = detectEncodingFromBom(data);
                    if (bomEncoding) {
                        const decoded = decodeText(bomEncoding);
                        if (decoded != null) return decoded;
                    }

                    const nullRatio = estimateNullRatio(data);
                    if (nullRatio > 0.1) {
                        const utf16Text = decodeText('utf-16le');
                        if (utf16Text) return utf16Text;
                    }

                    const utf8Text = decodeText('utf-8');
                    if (utf8Text && estimateReplacementRatio(utf8Text) < 0.02) {
                        return utf8Text;
                    }

                    const gbText = decodeText('gb18030');
                    if (gbText) return gbText;

                    return utf8Text;
                };

                if (extension === 'csv') {
                    try {
                        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
                        resolve(convertWorkbookToMarkdown(workbook));
                        return;
                    } catch (_) { }
                    try {
                        const workbook = XLSX.read(data, { type: 'array', codepage: 936 });
                        resolve(convertWorkbookToMarkdown(workbook));
                        return;
                    } catch (_) { }

                    const decodedText = decodeWithStrategy();
                    if (!decodedText) {
                        reject(new Error(getToastMessage('console.unrecognizedEncoding')));
                        return;
                    }
                    try {
                        const workbook = XLSX.read(decodedText, { type: 'string' });
                        resolve(convertWorkbookToMarkdown(workbook));
                        return;
                    } catch (csvParseError) {
                        console.error(getToastMessage('console.failedToParseDecodedContent'), csvParseError);
                        // Fall through to binary parsing
                    }
                }

                try {
                    const workbook = XLSX.read(data, { type: 'array' });
                    resolve(convertWorkbookToMarkdown(workbook));
                    return;
                } catch (_) {
                    // fall through
                }

                let decodedContent;
                try {
                    decodedContent = new TextDecoder('utf-8', { fatal: true }).decode(data);
                } catch (error) {
                    try {
                        decodedContent = new TextDecoder('gb18030').decode(data);
                    } catch (gbkError) {
                        console.error(getToastMessage('console.failedToDecodeFileWithBothEncodings'), gbkError);
                        reject(new Error(getToastMessage('console.unrecognizedEncoding')));
                        return;
                    }
                }

                try {
                    const workbook = XLSX.read(decodedContent, { type: 'string' });
                    resolve(convertWorkbookToMarkdown(workbook));
                } catch (parseError) {
                    console.error(getToastMessage('console.failedToParseDecodedContent'), parseError);
                    reject(parseError);
                }
            };

            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        }), DEFAULT_PARSE_TIMEOUT_MS, getToastMessage('fileManagement.parseTimeout') || 'File parse timeout.');
    };

    return { readExcelFile };
}
