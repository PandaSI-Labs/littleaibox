export function createExcelReader({ loadScript, getToastMessage }) {
    const readExcelFile = async (file) => {
        await loadScript('/libs/xlsx.full.min.js', 'XLSX');

        return new Promise((resolve, reject) => {
            const maxColumns = 100;

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
        });
    };

    return { readExcelFile };
}
