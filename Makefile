SHELL := /bin/bash

DST := $(patsubst %.src.html,%.html,$(wildcard *.src.html))
REMOTE := $(filter remote,$(MAKECMDGOALS))

%.html : %.src.html
ifndef REMOTE
# When addding a new registry entry, bikeshed will error out, this allows
# bypassing the error.
ifdef WEBCODECS_IGNORE_WARNINGS
	@ echo "Building $@, ignoring warnings"
	bikeshed -f spec $< $@
else
	@ echo "Building $@"
	bikeshed --die-on=warning spec $< $@
endif
else
	@ echo "Building $@ remotely"
	@ (HTTP_STATUS=$$(curl https://api.csswg.org/bikeshed/ \
	                       --output $@ \
	                       --write-out "%{http_code}" \
	                       --header "Accept: text/plain, text/html" \
	                       -F die-on=warning \
	                       -F file=@$<) && \
	[[ "$$HTTP_STATUS" -eq "200" ]]) || ( \
		echo ""; cat $@; echo ""; \
		rm -f index.html; \
		exit 22 \
	);
endif

all: $(DST)
	@ echo "All done"

remote: all

ci:
	mkdir -p out
	make remote
	mv $(DST) out

