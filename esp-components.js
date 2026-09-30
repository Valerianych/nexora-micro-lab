import '@wokwi/elements/dist/esm/esp32-devkit-v1-element.js';
import '@wokwi/elements/dist/esm/resistor-element.js';
import '@wokwi/elements/dist/esm/led-element.js';
import '@wokwi/elements/dist/esm/pushbutton-element.js';
import '@wokwi/elements/dist/esm/servo-element.js';
import '@wokwi/elements/dist/esm/mpu6050-element.js';

// Model modules keep their teaching connectors; the drawings identify the hardware.
const pcb=(content,color='#21645d')=>`<svg viewBox="0 0 150 104" aria-hidden="true"><rect x="5" y="6" width="140" height="92" rx="7" fill="${color}" stroke="#74a997" stroke-width="2"/><g fill="#13232a" stroke="#d7ba6c" stroke-width="3"><circle cx="15" cy="16" r="4"/><circle cx="135" cy="16" r="4"/><circle cx="15" cy="88" r="4"/><circle cx="135" cy="88" r="4"/></g><path d="M20 34H130M20 74H130M35 20V86M115 20V86" stroke="#74a997" fill="none" opacity=".4"/>${content}</svg>`;
const drawings={
  esp:'<wokwi-esp32-devkit-v1></wokwi-esp32-devkit-v1>',
  r:'<wokwi-resistor value="220"></wokwi-resistor>',
  led:'<wokwi-led color="green"></wokwi-led>',
  button:'<wokwi-pushbutton color="#73bc39"></wokwi-pushbutton>',
  servo:'<wokwi-servo angle="90"></wokwi-servo>',
  imu:'<wokwi-mpu6050></wokwi-mpu6050>',
  camera:pcb('<rect x="24" y="26" width="102" height="54" rx="8" fill="#101920" stroke="#3e535d" stroke-width="3"/><circle cx="75" cy="52" r="30" fill="#101318" stroke="#81989f" stroke-width="3"/><circle cx="75" cy="52" r="22" fill="#122c47" stroke="#445665" stroke-width="4"/><circle cx="75" cy="52" r="13" fill="#081727"/><ellipse cx="69" cy="44" rx="8" ry="5" fill="#76c6e0" opacity=".8"/><text x="20" y="92" fill="#d0eee4" font-size="9" font-family="monospace">SPI CAMERA</text>'),
  range:pcb('<rect x="40" y="23" width="70" height="48" rx="4" fill="#313b44" stroke="#b3bec7" stroke-width="3"/><circle cx="58" cy="47" r="12" fill="#141b28" stroke="#726897" stroke-width="3"/><circle cx="92" cy="47" r="10" fill="#201e33" stroke="#726897" stroke-width="3"/><path d="M55 78H95" stroke="#d5b46f" stroke-width="5"/><text x="48" y="92" fill="#d0eee4" font-size="9" font-family="monospace">ToF · I²C</text>','#315b82'),
  battery:pcb('<rect x="22" y="22" width="53" height="59" rx="6" fill="#202a30" stroke="#bdd0d2" stroke-width="2"/><rect x="38" y="16" width="20" height="7" rx="2" fill="#bcccd1"/><rect x="28" y="33" width="41" height="30" rx="3" fill="#9bce68"/><path d="M43 40H54M48.5 35V46" stroke="#20352a" stroke-width="2"/><path d="M85 27V82" stroke="#d7bd77" stroke-width="3"/><rect x="79" y="36" width="12" height="14" fill="#d8be8c"/><rect x="79" y="59" width="12" height="14" fill="#d8be8c"/><text x="100" y="50" fill="#d0eee4" font-size="11" font-family="monospace">1:2</text>'),
  driver:pcb('<g fill="#d7b673"><path d="M38 28H112V32H38zM38 38H112V42H38zM38 48H112V52H38zM38 58H112V62H38zM38 68H112V72H38z"/></g><rect x="48" y="23" width="53" height="56" rx="3" fill="#19212c" stroke="#88939e"/><path d="M58 31V70M67 31V70M76 31V70M85 31V70M94 31V70" stroke="#444f5c" stroke-width="3"/><rect x="112" y="32" width="18" height="40" rx="2" fill="#418be1"/><g fill="#c4d6df"><circle cx="121" cy="42" r="5"/><circle cx="121" cy="61" r="5"/></g><text x="45" y="92" fill="#f7e0cb" font-size="9" font-family="monospace">MOTOR / PWM</text>','#7d3939'),
};
export const espComponentMarkup=id=>`<div class="esp-component-visual esp-visual-${id}" aria-hidden="true">${drawings[id]||''}</div>`;
