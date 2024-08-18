import { useState, useEffect } from "react";
import { createBiomeFloorApp } from "./createBiomeFloorApp";

export function BiomeFloor() {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (ref) {
      let unsubscribe = () => {};
      createBiomeFloorApp().then((x) => {
        ref.appendChild(x.canvas);

        unsubscribe = () => {
          ref.removeChild(x.canvas);
          x.destroy();
        };
      });

      return () => unsubscribe();
    }
  }, [ref]);
  return (
    <div
      style={{ display: "flex", justifyContent: "center" }}
      ref={setRef}
    ></div>
  );
}
