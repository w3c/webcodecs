# WebCodecs - Security and Privacy Questionnaire

This document answers the [W3C Security and Privacy
Questionnaire](https://w3ctag.github.io/security-questionnaire/) for the
WebCodecs specification.

Last Update: 2020-01-21

**What information might this feature expose to Web sites or other parties, and
for what purposes is that exposure necessary?**

This feature may expose additional information about what media a user agent is
capable of encoding or decoding. Such information is largely already available
through other media APIs such as MediaRecorder, Media Source Extensions, WebRTC,
and Media Capabilities, but lower-level media APIs, such as this one may subtly
expose more information or make it easier to obtain the same information. For
example, this feature may expose timing information about how long media takes
to encode and/or decode.

This is a necessary part of exposing a lower-level API that provides more direct
control.

**Do features in your specification expose the minimum amount of information
necessary to enable their intended uses?**

Yes. It will only expose information when it is necessary to expose controls.
For example, if a necessary control is added, then it would be easy to derive
whether the user agent is capable of supporting that control by attempting to
use it and seeing if it fails.

**How do the features in your specification deal with personal information,
personally-identifiable information (PII), or information derived from them?**

This specification does not deal with PII.

**How do the features in your specification deal with sensitive information?**

It will avoid exposing information about the user's hardware, operating system,
etc, such as model names of hardware decoders or versions of software encoder
implementations.

**Do the features in your specification introduce new state for an origin that
persists across browsing sessions?**

No.

**Do the features in your specification expose information about the underlying
platform to origins?**

As noted above, it may indirectly expose what the underlying platform is capable
of (which is largely possible already), but such information would be consistent
across origins and would not be related to user configuration.

**Do features in this specification allow an origin access to sensors on a
user’s device?**

No.

**What data do the features in this specification expose to an origin? Please
also document what data is identical to data exposed by other features, in the
same or different contexts.**

As noted above, it exposes information about what a platform is capable of in
terms of encoding and decoding, which is already possible via other media APIs
such as MediaRecorder, Media Source Extensions, WebRTC, and MediaCapabilities,
but may subtly expose more information such as more specific timing information.

**Do features in this specification enable new script execution/loading
mechanisms?**

No.


**Do features in this specification allow an origin to access other devices?**

No.


**Do features in this specification allow an origin some measure of control over
 a user agent’s native UI?**

No.


**What temporary identifiers do the features in this specification create or
expose to the web?**

None.


**How does this specification distinguish between behavior in first-party and
third-party contexts?**

The specification does not distinguish between 1st and 3rd party.

**How do the features in this specification work in the context of a browser’s
Private Browsing or Incognito mode?**

The specification does not prescribe a specific behavior for these modes. The
specified features do not inherently allow for detection such modes, nor do they
leak information between modes.

**Does this specification have both "Security Considerations" and "Privacy
Considerations" sections?**

Yes.

**Do features in your specification enable downgrading default security
characteristics?**

No.
