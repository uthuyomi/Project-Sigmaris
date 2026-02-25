import styles from "./EntryTouhouBackground.module.css";

export default function EntryTouhouBackground() {
  return (
    <div
      aria-hidden
      className={styles.root}
    >
      <div className={styles.base} />
      <div className={styles.glow} />
      <div className={styles.washiA} />
      <div className={styles.washiB} />
      <div className={styles.vignette} />
    </div>
  );
}
