# WebCodecs - Security and Privacy Questionnaire

This document answers the [W3C Security and Privacy
Questionnaire](https://www.w3.org/TR/security-privacy-questionnaire/) for the
WebCodecs specification.

Last Update: 2019-10-18

**2.1. What information might this feature expose to Web sites or other parties, and for what purposes is that exposure necessary?**

This feature may expose additional information about what media a user agent is
capable of encoding or decoding.  Such information is largely already available
through other media APIs such as MediaRecorder, Media Source Extensions, WebRTC,
and Media Capabilities, but lower-level media APIs, such as this one may subtly
expose more information or make it easier to obtain the same information.  For
example, this feature may expose timing information about how long media takes
to encode and/or decode.

This is a necessary part of exposing a lower-level API that provides more direct
control.


**2.2. Is this specification exposing the minimum amount of information necessary to power the feature?**

Yes.  It will only expose information when it is necessary to expose controls.
For example, if a necessary control is added, then it would be easy to derive
whether the user agent is capable of supporting that control by attempting to
use it and seeing if it fails.

**2.3. How does this specification deal with personal information or personally-identifiable information or information derived thereof?**

There is no PII involved.

**2.4. How does this specification deal with sensitive information?**

It will avoid exposing information about the user's hardware, operating system,
etc, such as model names of hardware decoders or versions of software encoder
implementations.

**2.5. Does this specification introduce new state for an origin that persists across browsing sessions?**

No.

**2.6. What information from the underlying platform, e.g. configuration data, is exposed by this specification to an origin? If so, is the information exposed from the underlying platform consistent across origins? This includes but is not limited to information relating to the user configuration, system information including sensors, and communication methods.**

As noted above, it may indirectly expose what the underlying platform is capable
of (which is largely possible already), but such information would be consistent
across origins and owuld not be related to user configuration.

**2.7. Does this specification allow an origin access to sensors on a user's device?**

No.

**2.8. What data does this specification expose to an origin? Please also document what data is identical to data exposed by other features, in the same or different contexts.**

As noted above, it exposes information about what a platform is capable of in
terms of encoding and decoding, which is already possible via other media APIs
such as MediaRecorder, Media Source Extensions, WebRTC, and MediaCapabilities,
but may subtly expose more information such as more specific timing information.

**2.9. Does this specification enable new script execution/loading mechanisms?**

No.

**2.10. Does this specification allow an origin to access other devices?**

No.

**2.11. Does this specification allow an origin some measure of control over a user agent's native UI?**

No.

**2.12. What temporary identifiers might this this specification create or expose to the web?**

None.

**2.13. How does this specification distinguish between behavior in first-party and third-party contexts?**

The specificiation does not distinguish between 1st and 3rd party.

**2.14. How does this specification work in the context of a user agent's Private Browsing or "incognito" mode?**

The specification behaves in the same way.

**2.15. Does this specification have a "Security Considerations" and "Privacy Considerations" section?**

Not yet, as the specification hasn't been formally written.  When it is written,
it should careful consider what new information is available that was not
already available with existing media APIs.

**2.16. Does this specification allow downgrading default security characteristics?**

No.

**2.17. What should this questionnaire have asked?**

No comment.
