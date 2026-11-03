import { campaignSlides } from "../model/slides";
import { CampaignHero } from "./campaign-hero";
import styles from "./campaign-hero.module.css";

export function Hero() {
  return (
    <>
      <CampaignHero slides={campaignSlides} />
      <div className={`values ${styles.values}`}>
        <div className={styles.valuesInner}>
          <span className={styles.valueItem}>Contemporary Silhouettes</span>
          <i className={styles.valueSparkle} aria-hidden="true">✧</i>
          <span className={styles.valueItem}>A Love For Detail</span>
          <i className={styles.valueSparkle} aria-hidden="true">✧</i>
          <span className={styles.valueItem}>Effortlessly You</span>
        </div>
      </div>
    </>
  );
}
