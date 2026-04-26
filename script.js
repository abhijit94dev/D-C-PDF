document.addEventListener("DOMContentLoaded", function () {

    const loader = document.getElementById("file-loader");

    function showLoader() {
        if (loader) loader.style.display = "flex";
    }

    function hideLoader() {
        if (loader) loader.style.display = "none";
    }

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
    let uploadFolderName = "Processed_PDFs";

    const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

    /* ---------- DRAG DROP ---------- */
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        showLoader();

        setTimeout(() => {
            handleFiles(e.dataTransfer.files);
        }, 100);
    });

    /* ---------- FILE SELECT ---------- */
    fileInput.addEventListener('change', (e) => {
        hideLoader();
        handleFiles(e.target.files);
    });

    folderInput.addEventListener('change', (e) => {
        hideLoader();
        handleFiles(e.target.files);
    });

    /* ---------- HANDLE FILES ---------- */
    function handleFiles(fileList) {

        hideLoader();

        if (!fileList || fileList.length === 0) return;

        const pdfFiles = Array.from(fileList).filter(file =>
            file.type === 'application/pdf' ||
            file.name.toLowerCase().endsWith('.pdf')
        );

        if (pdfFiles.length === 0) {
            alert('No PDF files detected.');
            return;
        }

        uploadedFiles = pdfFiles;
        statFiles.innerText = uploadedFiles.length;

        if (uploadedFiles[0].webkitRelativePath) {
            const pathParts = uploadedFiles[0].webkitRelativePath.split('/');
            uploadFolderName = pathParts[0] || "Processed_PDFs";
        } else {
            uploadFolderName = "Processed_PDFs";
        }

        if (uploadedFiles.length === 1) {
            dropText.innerHTML =
                `Selected: <strong>${uploadedFiles[0].name}</strong>`;
        } else {
            dropText.innerHTML =
                `Selected Folder: <strong>${uploadFolderName}</strong> (${uploadedFiles.length} files)`;
        }

        processBtn.disabled = false;
        downloadBtn.classList.add('hidden');
        processingBoard.classList.add('hidden');
        dropZone.style.display = 'block';

        finalZipBlob = null;

        statPages.innerText = '0';
        statNames.innerText = '0';
        statPdfs.innerText = '0';
    }

    /* ---------- UI UPDATE ---------- */
    async function updateUIStatus(percent, text) {
        const p = Math.min(Math.round(percent), 100);

        progressBar.style.width = `${p}%`;
        percentageText.innerText = `${p}%`;
        statusText.innerText = text;

        await sleep(2);
    }

    function sanitizeFilename(name) {
        return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
    }

    /* ---------- PROCESS ---------- */
    processBtn.addEventListener('click', async () => {

        processBtn.disabled = true;
        downloadBtn.classList.add('hidden');
        dropZone.style.display = 'none';
        processingBoard.classList.remove('hidden');

        let totalPagesScanned = 0;
        let allExtractedPages = [];

        try {

            /* STEP 1 */
            for (let f = 0; f < uploadedFiles.length; f++) {

                const file = uploadedFiles[f];

                await updateUIStatus(
                    (f / uploadedFiles.length) * 30,
                    `Parsing File ${f + 1}/${uploadedFiles.length}...`
                );

                const fileBuffer = await file.arrayBuffer();
                const pdfDoc = await pdfjsLib.getDocument({
                    data: fileBuffer
                }).promise;

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

                    const textString =
                        textContent.items.map(item => item.str).join(' ');

                    if (/To,/i.test(textString)) {

                        const nameMatch =
                            textString.match(/([A-Z0-9\s&.\-]+?)\s*\(\d{4,8}\)/);

                        const dateMatch =
                            textString.match(/Date:\s*(\d{2}\.\d{2}\.\d{4})/);

                        let extractedInitials = currentInitials;

                        if (nameMatch) {
                            currentDealer =
                                sanitizeFilename(
                                    nameMatch[1]
                                        .replace(/To,/ig, "")
                                        .replace(/SHYAM STEEL/ig, "")
                                        .trim()
                                );
                        }

                        if (dateMatch) {
                            currentDate =
                                sanitizeFilename(dateMatch[1]);
                        }

                        currentInitials =
                            sanitizeFilename(extractedInitials);
                    }

                    allExtractedPages.push({
                        fileIndex: f,
                        file: file,
                        pageIndex: i - 1,
                        dealer: currentDealer,
                        date: currentDate,
                        initials: currentInitials
                    });
                }

                statPages.innerText = totalPagesScanned;
            }

            /* STEP 2 */
            const groupedPages = {};

            allExtractedPages.forEach(p => {

                const key =
                    `${p.dealer}_${p.initials}_${p.date}`;

                if (!groupedPages[key]) {
                    groupedPages[key] = {
                        dealer: p.dealer,
                        initials: p.initials,
                        date: p.date,
                        pages: []
                    };
                }

                groupedPages[key].pages.push(p);
            });

            const uniqueKeys = Object.keys(groupedPages);

            statNames.innerText =
                [...new Set(allExtractedPages.map(p => p.dealer))].length;

            statPdfs.innerText = uniqueKeys.length;

            await updateUIStatus(35, 'Preparing PDF structures...');

            const zip = new JSZip();
            const loadedPdfDocs = {};
            const isSingleFileMode = uploadedFiles.length === 1;

            /* STEP 3 */
            for (let j = 0; j < uniqueKeys.length; j++) {

                const key = uniqueKeys[j];
                const groupData = groupedPages[key];

                const newPdf =
                    await PDFLib.PDFDocument.create();

                const pagesByFile = {};

                groupData.pages.forEach(p => {
                    if (!pagesByFile[p.fileIndex]) {
                        pagesByFile[p.fileIndex] = {
                            file: p.file,
                            indices: []
                        };
                    }

                    pagesByFile[p.fileIndex].indices.push(p.pageIndex);
                });

                for (const fIndex in pagesByFile) {

                    const fileData = pagesByFile[fIndex];

                    if (!loadedPdfDocs[fIndex]) {

                        const sourceBuffer =
                            await fileData.file.arrayBuffer();

                        loadedPdfDocs[fIndex] =
                            await PDFLib.PDFDocument.load(sourceBuffer);
                    }

                    const sourcePdf = loadedPdfDocs[fIndex];

                    const copiedPages =
                        await newPdf.copyPages(
                            sourcePdf,
                            fileData.indices
                        );

                    copiedPages.forEach(page =>
                        newPdf.addPage(page)
                    );
                }

                const pdfBytes = await newPdf.save();

                const pdfName = `${key}.pdf`;

                if (isSingleFileMode) {
                    zip.file(pdfName, pdfBytes);
                } else {
                    zip.folder(groupData.dealer)
                        .file(pdfName, pdfBytes);
                }

                await updateUIStatus(
                    35 + ((j / uniqueKeys.length) * 45),
                    `Generating Document ${j + 1}/${uniqueKeys.length}...`
                );
            }

            /* STEP 4 */
            await updateUIStatus(80, 'Compressing Files...');

            finalZipBlob =
                await zip.generateAsync(
                    { type: 'blob' },
                    function (metadata) {

                        const totalPercent =
                            80 + (metadata.percent * 0.20);

                        progressBar.style.width =
                            `${totalPercent}%`;

                        percentageText.innerText =
                            `${Math.round(totalPercent)}%`;

                        statusText.innerText =
                            `Compressing: ${metadata.percent.toFixed(0)}%`;
                    }
                );

            await updateUIStatus(100, 'Processing Complete!');

            progressBar.style.backgroundColor = 'var(--success)';
            percentageText.style.color = 'var(--success)';

            downloadBtn.classList.remove('hidden');

        } catch (error) {

            console.error(error);

            await updateUIStatus(
                100,
                'Error: Processing failed.'
            );

            progressBar.style.backgroundColor = '#ef4444';
            percentageText.style.color = '#ef4444';

        } finally {

            processBtn.disabled = false;
            processBtn.innerText = "Process New Files";

            processBtn.onclick = () => location.reload();
        }
    });

    /* ---------- DOWNLOAD ---------- */
    downloadBtn.addEventListener('click', () => {
        if (finalZipBlob) {
            saveAs(finalZipBlob, `${uploadFolderName}.zip`);
        }
    });

});