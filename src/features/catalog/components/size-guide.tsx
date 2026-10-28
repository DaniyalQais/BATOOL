"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import styles from "./size-guide.module.css";

const measurements = [
  { size: "S", chest: 38, shirt: 42, sleeve: 21, trouser: 38 },
  { size: "M", chest: 40, shirt: 43, sleeve: 21.5, trouser: 39 },
  { size: "L", chest: 44, shirt: 44, sleeve: 22, trouser: 40 },
  { size: "XL", chest: 46, shirt: 45, sleeve: 22.5, trouser: 41 },
] as const;

export function SizeGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} aria-haspopup="dialog"
        aria-expanded={open} onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}>
        Size &amp; Fit Guide
      </button>
      {open && (
        <Modal label="Size & Fit Guide" onClose={() => setOpen(false)}
          className={styles.dialog} headerClassName={styles.header}
          closeButtonClassName={styles.closeButton}
          header={<h2>Size &amp; Fit Guide</h2>}>
          <p className={styles.intro}>A considered fit, from shirt to trouser.</p>
          <div className={styles.tableWrap} role="region" aria-label="Size measurements" tabIndex={0}>
            <table className={styles.table}>
              <caption>Finished garment measurements · inches</caption>
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">Chest</th>
                  <th scope="col">Shirt Length</th>
                  <th scope="col">Sleeve</th>
                  <th scope="col">Trouser Length</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map(row => (
                  <tr key={row.size}>
                    <th scope="row">{row.size}</th>
                    <td>{row.chest}</td><td>{row.shirt}</td>
                    <td>{row.sleeve}</td><td>{row.trouser}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.guidance}>
            <p><strong>How to measure</strong> Lay a well-fitting garment flat. Measure chest from underarm to underarm and double it for the full circumference shown above. Measure shirt length from the shoulder, sleeve from shoulder seam to cuff, and trouser length from waistband to hem.</p>
            <p><strong>Between sizes?</strong> Choose the larger size for a relaxed fit.</p>
            <p className={styles.note}>Sample size chart for this preview. Final style-specific measurements are subject to brand confirmation.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
