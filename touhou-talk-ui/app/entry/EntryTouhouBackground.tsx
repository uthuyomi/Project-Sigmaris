import styles from "./EntryTouhouBackground.module.css";
import EntryDanmakuWebGL from "./EntryDanmakuWebGL";

export default function EntryTouhouBackground() {
  return (
    <div
      aria-hidden
      className={styles.root}
    >
      <div className={styles.base} />
      <div className={styles.glow} />
      <EntryDanmakuWebGL />
      <div className={styles.washiA} />
      <div className={styles.washiB} />
      <div className={styles.vignette} />
    </div>
  );
}
