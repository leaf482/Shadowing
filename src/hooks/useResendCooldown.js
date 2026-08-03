import { useEffect, useState } from "react";

export function useResendCooldown(seconds = 30) {
  const [active, setActive] = useState(false);
  const [timerId, setTimerId] = useState(null);

  useEffect(() => () => {
    if (timerId) clearTimeout(timerId);
  }, [timerId]);

  const start = () => {
    setActive(true);
    if (timerId) clearTimeout(timerId);
    const nextTimerId = setTimeout(() => {
      setActive(false);
      setTimerId(null);
    }, Math.max(1, seconds) * 1000);
    setTimerId(nextTimerId);
  };

  return { active, start };
}
