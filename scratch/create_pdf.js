import { jsPDF } from "jspdf";
import fs from "fs";

const doc = new jsPDF();
doc.setFontSize(16);
doc.text("Lecture: Introduction to Photosynthesis", 10, 20);

doc.setFontSize(12);
const text = `Photosynthesis is the process used by plants, algae and certain bacteria to harness energy from sunlight and turn it into chemical energy.

There are two main stages of photosynthesis: the light-dependent reactions and the light-independent reactions (also known as the Calvin Cycle).

In the light-dependent reactions, which take place in the thylakoid membranes of chloroplasts, chlorophyll absorbs sunlight and converts it into chemical energy in the form of ATP and NADPH. During this stage, water molecules are split into oxygen, protons, and electrons. The oxygen is released as a byproduct into the atmosphere.

In the light-independent reactions or Calvin Cycle, which occur in the stroma of chloroplasts, the ATP and NADPH generated in the light reactions are used to fix carbon dioxide (CO2) into organic sugar molecules like glucose. This stage does not require direct sunlight but relies on the products of the light reactions.

Chloroplasts are the specialized organelles within plant cells where photosynthesis takes place. They contain chlorophyll, a green pigment that absorbs light energy.

Photosynthesis is critical for life on Earth as it is the primary source of oxygen in the atmosphere and forms the base of the global food chain by converting solar energy into organic matter.`;

const splitText = doc.splitTextToSize(text, 180);
doc.text(splitText, 10, 40);

const pdfBuffer = doc.output("arraybuffer");
fs.writeFileSync("sample_lecture.pdf", Buffer.from(pdfBuffer));
console.log("sample_lecture.pdf created successfully.");
