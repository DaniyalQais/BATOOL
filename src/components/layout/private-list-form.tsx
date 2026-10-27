"use client";
import { useId, useState, type FormEvent } from "react";
import styles from "./footer.module.css";

export function PrivateListForm() {
  const id = useId();
  const [message, setMessage] = useState("");
  const noteId = `${id}-note`;

  function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Preview only: no subscription created. Email not stored or sent.");
  }

  return (
    <form className={styles.form} onSubmit={subscribe} translate="no">
      <label htmlFor={id}>Email address</label>
      <input className={styles.email} id={id} type="email" required maxLength={254}
        autoComplete="email" placeholder="Your email address" aria-describedby={noteId}
        onChange={() => setMessage("")} />
      <button className={styles.subscribe} type="submit">Subscribe</button>
      <p id={noteId} className={styles.feedback} role="status" aria-atomic="true">
        {message || "Demo signup only. Email addresses are not stored or sent."}
      </p>
    </form>
  );
}
