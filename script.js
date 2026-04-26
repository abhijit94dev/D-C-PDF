document.addEventListener("DOMContentLoaded", function () {

    // তোমার পুরো existing script.js code এখানে



    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/gh/abhijit94dev/D-C-PDF/libs/pdf.worker.min.js';

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const dropText = document.getElementById('drop-text');
    const processBtn = document.getElementById('process-btn');
    const downloadBtn = document.getElementById('download-btn');
    const processingBoard = document.getElementById('processing-board');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    const percentageText = document.getElementById('percentage-text');

    const statFiles = document.getElementById('stat-files');
    const statPages = document.getElementById('stat-pages');
    const statNames = document.getElementById('stat-names');
    const statPdfs = document.getElementById('stat-pdfs');

    let uploadedFiles = [];
    let finalZipBlob = null;
    let uploadFolderName = "Processed_PDFs"; // Default name

    const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(fileList) {
        const pdfFiles = Array.from(fileList).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length === 0) { alert('No PDF files detected.'); return; }

        uploadedFiles = pdfFiles;
        statFiles.innerText = uploadedFiles.length;

        // Detect folder name from webkitRelativePath
        if (uploadedFiles[0].webkitRelativePath) {
            const pathParts = uploadedFiles[0].webkitRelativePath.split('/');
            if (pathParts.length > 1) {
                uploadFolderName = pathParts[0];
            }
        } else {
            uploadFolderName = "Processed_PDFs";
        }

        if (uploadedFiles.length === 1) {
            dropText.innerHTML = `Selected: <strong>${uploadedFiles[0].name}</strong>`;
        } else {
            dropText.innerHTML = `Selected Folder: <strong>${uploadFolderName}</strong> (${uploadedFiles.length} files)`;
        }

        processBtn.disabled = false;
        downloadBtn.classList.add('hidden');
        processingBoard.classList.add('hidden');
        dropZone.style.display = 'block';
        finalZipBlob = null;

        statPages.innerText = '0'; statNames.innerText = '0'; statPdfs.innerText = '0';
    }

    async function updateUIStatus(percent, text) {
        const p = Math.min(Math.round(percent), 100);
        progressBar.style.width = `${p}%`;
        percentageText.innerText = `${p}%`;
        statusText.innerText = text;
        await sleep(2); // Keep UI thread unblocked
    }

    function sanitizeFilename(name) {
        return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
    }

    processBtn.addEventListener('click', async () => {
        processBtn.disabled = true;
        downloadBtn.classList.add('hidden');
        dropZone.style.display = 'none';
        processingBoard.classList.remove('hidden');

        let totalPagesScanned = 0;
        let allExtractedPages = [];

        try {
            // STEP 1: Parse Files
            for (let f = 0; f < uploadedFiles.length; f++) {
                const file = uploadedFiles[f];
                await updateUIStatus((f / uploadedFiles.length) * 30, `Parsing File ${f + 1}/${uploadedFiles.length}...`);

                const fileBuffer = await file.arrayBuffer();
                const pdfDoc = await pdfjsLib.getDocument({ data: fileBuffer }).promise;

                let currentDealer = "Unknown";
                let currentDate = "NoDate";
                let currentInitials = "CMP";

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    totalPagesScanned++;
                    if (i % 5 === 0) {
                        statPages.innerText = totalPagesScanned;
                        await sleep(1);
                    }

                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const textString = textContent.items.map(item => item.str).join(' ');

                    if (/To,/i.test(textString)) {
                        const nameMatch = textString.match(/([A-Z0-9\s&.\-]+?)\s*\(\d{4,8}\)/);
                        const dateMatch = textString.match(/Date:\s*(\d{2}\.\d{2}\.\d{4})/);

                        let extractedInitials = currentInitials;
                        const premisesIndex = textString.indexOf("Premises No");

                        if (premisesIndex > -1) {
                            let beforeText = textString.substring(0, premisesIndex).trim();
                            let words = beforeText.replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(w => w.length > 0 && w !== 'M' && w !== 'S');
                            let uniqueWords = [...new Set(words)];
                            if (uniqueWords.length > 0) {
                                extractedInitials = uniqueWords.map(w => w[0]).join('');
                            }
                        } else {
                            let words = textString.substring(0, 200).replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
                            let uniqueWords = [...new Set(words)].slice(0, 4);
                            if (uniqueWords.length > 0) {
                                extractedInitials = uniqueWords.map(w => w[0]).join('');
                            }
                        }

                        if (nameMatch) {
                            let rawName = nameMatch[1].replace(/To,/ig, "").replace(/SHYAM STEEL/ig, "").trim();
                            currentDealer = sanitizeFilename(rawName);
                        }
                        if (dateMatch) {
                            currentDate = sanitizeFilename(dateMatch[1]);
                        }
                        currentInitials = sanitizeFilename(extractedInitials);
                    }

                    allExtractedPages.push({
                        fileIndex: f, file: file, pageIndex: i - 1,
                        dealer: currentDealer, date: currentDate, initials: currentInitials
                    });
                }
                statPages.innerText = totalPagesScanned;
            }

            // STEP 2: Group by Dealer + Initials + Date
            const groupedPages = {};
            allExtractedPages.forEach(p => {
                const key = `${p.dealer}_${p.initials}_${p.date}`;
                if (!groupedPages[key]) groupedPages[key] = { dealer: p.dealer, initials: p.initials, date: p.date, pages: [] };
                groupedPages[key].pages.push(p);
            });

            const uniqueKeys = Object.keys(groupedPages);
            statNames.innerText = [...new Set(allExtractedPages.map(p => p.dealer))].length;
            statPdfs.innerText = uniqueKeys.length;

            await updateUIStatus(35, 'Preparing PDF structures...');
            const zip = new JSZip();
            const loadedPdfDocs = {};
            const isSingleFileMode = uploadedFiles.length === 1;

            // STEP 3: PDF Generation
            for (let j = 0; j < uniqueKeys.length; j++) {
                const key = uniqueKeys[j];
                const groupData = groupedPages[key];
                const newPdf = await PDFLib.PDFDocument.create();

                const pagesByFile = {};
                groupData.pages.forEach(p => {
                    if (!pagesByFile[p.fileIndex]) pagesByFile[p.fileIndex] = { file: p.file, indices: [] };
                    pagesByFile[p.fileIndex].indices.push(p.pageIndex);
                });

                for (const fIndex in pagesByFile) {
                    const fileData = pagesByFile[fIndex];
                    if (!loadedPdfDocs[fIndex]) {
                        const sourceBuffer = await fileData.file.arrayBuffer();
                        loadedPdfDocs[fIndex] = await PDFLib.PDFDocument.load(sourceBuffer);
                        await sleep(2);
                    }
                    const sourcePdf = loadedPdfDocs[fIndex];
                    const copiedPages = await newPdf.copyPages(sourcePdf, fileData.indices);
                    copiedPages.forEach(page => newPdf.addPage(page));
                }

                const pdfBytes = await newPdf.save();
                await sleep(2);

                const pdfName = `${key}.pdf`;

                if (isSingleFileMode) {
                    zip.file(pdfName, pdfBytes);
                } else {
                    zip.folder(groupData.dealer).file(pdfName, pdfBytes);
                }

                await updateUIStatus(35 + ((j / uniqueKeys.length) * 45), `Generating Document ${j + 1}/${uniqueKeys.length}...`);
            }

            // STEP 4: ZIP Compression
            await updateUIStatus(80, 'Compressing Files...');

            finalZipBlob = await zip.generateAsync({ type: 'blob' }, function updateCallback(metadata) {
                const totalPercent = 80 + (metadata.percent * 0.20);
                progressBar.style.width = `${totalPercent}%`;
                percentageText.innerText = `${Math.round(totalPercent)}%`;
                statusText.innerText = `Compressing: ${metadata.percent.toFixed(0)}%`;
            });

            // Final UI State
            await updateUIStatus(100, 'Processing Complete!');
            progressBar.style.backgroundColor = 'var(--success)';
            percentageText.style.color = 'var(--success)';
            downloadBtn.classList.remove('hidden');

        } catch (error) {
            console.error("Processing Error:", error);
            await updateUIStatus(100, 'Error: Processing failed.');
            progressBar.style.backgroundColor = '#ef4444';
            percentageText.style.color = '#ef4444';
        } finally {
            processBtn.disabled = false;
            processBtn.innerText = "Process New Files";
            processBtn.onclick = () => location.reload();
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (finalZipBlob) {
            saveAs(finalZipBlob, `${uploadFolderName}.zip`);
        }
    });
});