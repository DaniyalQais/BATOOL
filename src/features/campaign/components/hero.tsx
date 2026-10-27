import { campaignSlides } from "../model/slides";
import { CampaignHero } from "./campaign-hero";
import styles from "./campaign-hero.module.css";

export function Hero() {
  return (
    <>
      <CampaignHero slides={campaignSlides} />
      <div className={`values ${styles.values}`}>
        <span>CONTEMPORARY SILHOUETTES</span>
        <i>✧</i>
        <span>A LOVE FOR DETAIL</span>
        <i>✧</i>
        <span>EFFORTLESSLY YOU</span>
      </div>
    </>
  );
}
