import founder from "../public/team/founder.jpg";
import coFounder from "../public/team/co-founder.jpg";
import jewelShahin from "../public/team/jewel-shahin.jpg";
import amzadHossain from "../public/team/amzad-hossain.jpg";
import akhidulHasan from "../public/team/akhidul-hasan.jpg";
import aktaruzzamman from "../public/team/aktaruzzamman.jpg";
import joyAhmed from "../public/team/joy-ahmed.jpg";
import mitun from "../public/team/mitun.jpg";
import training1 from "../public/tranning1.jpeg";
import training2 from "../public/tranning2.jpeg";
import training3 from "../public/tranning3.jpeg";
import training4 from "../public/tranning4.jpeg";
import training5 from "../public/tranning5.jpeg";
import training18 from "../public/tranning18.jpeg";
import training145 from "../public/tranning145.jpeg";
import training195 from "../public/tranning195.jpeg";

// The production host does not serve these /public files by their raw path
// (only through the hashed /_next/static/media URL a build-time import
// produces). Admin-managed content stores the plain "/team/x.jpg" path, so
// every place that renders one resolves it through this map first. Any other
// value (an https URL, a path that is genuinely served) passes through.
const BUNDLED = {
  "/team/founder.jpg": founder,
  "/team/co-founder.jpg": coFounder,
  "/team/jewel-shahin.jpg": jewelShahin,
  "/team/amzad-hossain.jpg": amzadHossain,
  "/team/akhidul-hasan.jpg": akhidulHasan,
  "/team/aktaruzzamman.jpg": aktaruzzamman,
  "/team/joy-ahmed.jpg": joyAhmed,
  "/team/mitun.jpg": mitun,
  "/tranning1.jpeg": training1,
  "/tranning2.jpeg": training2,
  "/tranning3.jpeg": training3,
  "/tranning4.jpeg": training4,
  "/tranning5.jpeg": training5,
  "/tranning18.jpeg": training18,
  "/tranning145.jpeg": training145,
  "/tranning195.jpeg": training195,
};

export function resolvePhoto(path) {
  return (path && BUNDLED[path]?.src) || path || "";
}
