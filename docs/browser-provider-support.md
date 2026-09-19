# Browser supplier support

The launched browser app is local-only. `web/ttokttok/src/providers.ts` defines
every catalog entry with `webMode: 'official-site'`. It opens the listed supplier
site in a separate tab and does not send a supplier request itself.

There is no established direct browser path for supplier login, contract selection,
billing retrieval, meter-reading submission, or submission-result readback. This is
an absence of an implemented and verified browser path. It is not evidence that a
supplier rejects CORS, nor evidence that a supplier endpoint does not exist.

| Family | Catalog evidence | Browser assessment |
| --- | --- | --- |
| SK E&S | `providers.ts` entries use `skens.com` official login URLs and `family: 'SK E&S'`. | Official-site handoff only. No direct browser flow is established. |
| 가스앱 | `providers.ts` labels the listed regional suppliers `family: '가스앱'`. | Official-site handoff only. No direct browser flow is established. |
| 삼천리 | `providers.ts` maps `samchully` to `https://cs.samchully.co.kr/`. | Official-site handoff only. No direct browser flow is established. |
| EnergyTalk | `providers.ts` maps CNCITY, 경남에너지, 서라벌도시가스, and 지에스이 to this family. | Official-site handoff only. No direct browser flow is established. |
| 직접 공급사 포털 | `providers.ts` maps 대성에너지, 대성청정에너지, 해양에너지 here. | Official-site handoff only. No direct browser flow is established. |
| 직접 입력 | `providers.ts` maps 명성파워그린 and `other` here. | The browser app accepts locally entered periods and readings. It still does not contact a supplier. |

The provider list was transcribed from the Android compatibility baseline noted in
`web/ttokttok/src/providers.ts` at native revision
`ac6eb498fa90e00c4f5475c31566c573053dbad2`. The source link for the native
project is <https://github.com/mahlernim/gas-self-meter-ai>. Before adding a
browser adapter, record the official source, request semantics, authentication
boundary, consent, failure mode, and a tested result readback. Do not infer
support from a mobile family name or an official-site link.
