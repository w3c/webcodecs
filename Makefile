
LOCAL_BIKESHED := $(shell command -v bikeshed 2> /dev/null)

index.html: index.bs
#	./format.py $<
ifndef LOCAL_BIKESHED
	curl https://api.csswg.org/bikeshed/ -f -F file=@$< >$@;
else
	bikeshed spec
endif