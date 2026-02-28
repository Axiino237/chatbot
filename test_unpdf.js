import fs from 'fs';

async function testExtraction() {
    try {
        const fileData = fs.readFileSync('dummy.pdf');
        const pdfBytes = new Uint8Array(fileData);
        // We'll use dynamic import as in the edge function
        const { getDocument } = await import("unpdf");

        const pdf = await getDocument(pdfBytes);
        console.log("Num pages:", pdf.numPages);

        const pages = await Promise.all(
            Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1))
        )

        const textContent = await Promise.all(
            pages.map(async (page) => {
                const content = await page.getTextContent()
                return content.items.map((item) => item.str).join(" ")
            })
        )

        const text = textContent.join("\n\n");
        console.log("Extracted snippet:\n", text.slice(0, 500));

    } catch (e) {
        console.error(e);
    }
}

testExtraction();
